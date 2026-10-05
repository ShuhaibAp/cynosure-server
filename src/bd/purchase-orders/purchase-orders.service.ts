import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, QueryFilter, Types } from 'mongoose';
import { AuditService, Actor } from '../../common/audit/audit.service.js';
import {
  PIPELINE_STATUSES,
  PoStatus,
} from '../../common/enums/po-status.enum.js';
import { ServiceType } from '../../common/enums/service-type.enum.js';
import { CustomerAccessService } from '../../common/customers/customer-access.service.js';
import { CustomersService } from '../../common/customers/customers.service.js';
import { PoFilesService } from '../../common/files/po-files.service.js';
import { StoredFileDoc } from '../../common/files/stored-file.schema.js';
import {
  PickupRequest,
  PickupRequestDocument,
} from '../pickup-requests/schemas/pickup-request.schema.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { counterKey, formatPoNumber } from './po-number.js';
import { Counter } from './schemas/counter.schema.js';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from './schemas/purchase-order.schema.js';
import {
  ServiceTypeOption,
  ServiceTypeDocument,
} from './schemas/service-type.schema.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clip = (v: unknown) =>
  typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…` : v;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Counter.name) private counterModel: Model<Counter>,
    @InjectModel(ServiceTypeOption.name)
    private serviceTypeModel: Model<ServiceTypeDocument>,
    @InjectModel(PickupRequest.name)
    private pickupModel: Model<PickupRequestDocument>,
    private customers: CustomersService,
    private customerAccess: CustomerAccessService,
    private files: PoFilesService,
    private audit: AuditService,
  ) {}

  /** Built-in types first, then the ones BD added, oldest first. */
  async listServiceTypes(): Promise<string[]> {
    const custom = await this.serviceTypeModel
      .find()
      .sort({ createdAt: 1 })
      .exec();
    return [...Object.values(ServiceType), ...custom.map((t) => t.name)];
  }

  /** Adds a PO type; a name that already exists (any casing) is returned as is. */
  async addServiceType(name: string, actor: Actor) {
    const existing = (await this.listServiceTypes()).find(
      (t) => t.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return { name: existing };
    try {
      await this.serviceTypeModel.create({
        name,
        key: name.toLowerCase(),
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      // Two people adding the same name at once: the unique key makes one lose.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
    return { name };
  }

  /** Matches a submitted type to a known one (any casing) or rejects it. */
  private async resolveServiceType(value: string): Promise<string> {
    const match = (await this.listServiceTypes()).find(
      (t) => t.toLowerCase() === value.toLowerCase(),
    );
    if (!match) throw new BadRequestException('Select a valid service type');
    return match;
  }

  private async nextPoNumber(): Promise<string> {
    const year = new Date().getFullYear();
    for (let attempt = 0; ; attempt++) {
      try {
        const counter = await this.counterModel
          .findOneAndUpdate(
            { _id: counterKey(year) },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' },
          )
          .exec();
        return formatPoNumber(year, counter!.seq);
      } catch (err) {
        // Two first-ever requests can race on the upsert; the loser retries.
        if ((err as { code?: number }).code === 11000 && attempt < 3) continue;
        throw err;
      }
    }
  }

  private record(
    actor: Actor,
    action: string,
    po: PurchaseOrderDocument,
    details?: Record<string, unknown>,
  ) {
    return this.audit.record({
      actor,
      action,
      entityType: 'PurchaseOrder',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  async findOrThrow(id: string): Promise<PurchaseOrderDocument> {
    if (!isValidObjectId(id))
      throw new NotFoundException('Purchase order not found');
    const po = await this.poModel.findById(id).exec();
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  findByIds(ids: Types.ObjectId[]) {
    return this.poModel.find({ _id: { $in: ids } }).exec();
  }

  /** Moves a PO between lifecycle stages atomically; returns null if it was no longer in `from`. */
  transitionStatus(id: Types.ObjectId, from: PoStatus, to: PoStatus) {
    return this.poModel
      .findOneAndUpdate(
        { _id: id, status: from },
        { $set: { status: to } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /**
   * Module 5 (FR-05.03): the Pickup Request screen edits PO Instructions after Registration,
   * bidirectionally syncing back to this record (and, later, the Factory tab, which reads the
   * same field). This deliberately bypasses the Registration-only lock that `update()` enforces
   * - only PickupRequestsService calls it, gated on the PO being in the Pickup stage.
   */
  async updatePoInstructions(
    id: Types.ObjectId,
    poInstructions: string,
    actor: Actor,
  ) {
    const po = await this.poModel
      .findOneAndUpdate(
        { _id: id },
        { $set: { poInstructions } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!po) throw new NotFoundException('Purchase order not found');
    await this.record(actor, 'po.instructions_updated', po, {
      length: poInstructions.length,
    });
    return po;
  }

  private toResponse(po: PurchaseOrderDocument) {
    return {
      id: po._id.toString(),
      poNumber: po.poNumber,
      status: po.status,
      locked: po.status !== PoStatus.Registration,
      serviceType: po.serviceType,
      poInstructions: po.poInstructions,
      customer: {
        id: po.customerId.toString(),
        name: po.customerDetails.name,
        address: po.customerDetails.address,
        location: po.customerDetails.location ?? '',
        phone: po.customerDetails.phone,
        email: po.customerDetails.email,
      },
      documents: (po.documents as StoredFileDoc[]).map((d) => ({
        id: d._id.toString(),
        name: d.originalName,
        mimeType: d.mimeType,
        size: d.size,
        uploadedAt: d.uploadedAt,
      })),
      createdBy: { id: po.createdBy.toString(), name: po.createdByName },
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };
  }

  async create(
    dto: CreatePurchaseOrderDto,
    rawFiles: Express.Multer.File[],
    actor: Actor,
  ) {
    const serviceType = await this.resolveServiceType(dto.serviceType);
    const prepared = this.files.prepare(rawFiles);
    const customer = await this.customers.create(
      {
        name: dto.customerName,
        address: dto.address,
        location: dto.location,
        phone: dto.phone,
        email: dto.email,
      },
      actor.userId,
    );

    let poNumber: string | undefined;
    let po: PurchaseOrderDocument;
    try {
      poNumber = await this.nextPoNumber();
      const stored = await this.files.save(poNumber, 'documents', prepared);
      po = await this.poModel.create({
        poNumber,
        customerId: customer._id,
        customerDetails: {
          name: customer.name,
          address: customer.address,
          location: customer.location ?? '',
          phone: customer.phone,
          email: customer.email,
        },
        serviceType,
        poInstructions: dto.poInstructions ?? '',
        documents: stored,
        status: PoStatus.Registration,
        createdBy: new Types.ObjectId(actor.userId),
        createdByName: actor.name,
      });
    } catch (err) {
      await this.customers.delete(customer._id);
      if (poNumber) await this.files.removeAll(poNumber);
      throw err;
    }

    await this.record(actor, 'po.created', po, {
      customerName: customer.name,
      serviceType: po.serviceType,
      documents: po.documents.length,
    });
    return this.toResponse(po);
  }

  async list(query: ListPurchaseOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const filter: QueryFilter<PurchaseOrderDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      const rx = new RegExp(escapeRegex(query.search), 'i');
      filter.$or = [{ poNumber: rx }, { 'customerDetails.name': rx }];
    }

    const [items, total] = await Promise.all([
      this.poModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.poModel.countDocuments(filter).exec(),
    ]);

    // FR-06.03: the PO List shows a collection countdown for POs in the Operations stage -
    // batch-fetch scheduled dates only for those rows rather than joining on every page load.
    const opsIds = items
      .filter((po) => po.status === PoStatus.Operations)
      .map((po) => po._id);
    const pickups = opsIds.length
      ? await this.pickupModel
          .find({ poId: { $in: opsIds } }, { poId: 1, collectionDateTime: 1 })
          .exec()
      : [];
    const scheduledById = new Map(
      pickups.map((p) => [p.poId.toString(), p.collectionDateTime]),
    );

    return {
      total,
      page,
      limit,
      items: items.map((po) => ({
        id: po._id.toString(),
        poNumber: po.poNumber,
        customerName: po.customerDetails.name,
        serviceType: po.serviceType,
        status: po.status,
        locked: po.status !== PoStatus.Registration,
        documentCount: po.documents.length,
        createdByName: po.createdByName,
        createdAt: po.createdAt,
        scheduledCollectionAt:
          po.status === PoStatus.Operations
            ? (scheduledById.get(po._id.toString()) ?? null)
            : null,
      })),
    };
  }

  /** Dashboard numbers: PO count per lifecycle stage plus the newest orders. */
  async summary() {
    const [grouped, recent] = await Promise.all([
      this.poModel
        .aggregate<{ _id: PoStatus; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.list({ limit: 5 }),
    ]);
    const counts = new Map(grouped.map((g) => [g._id, g.count]));
    // The pipeline breakdown is the 10 ordered stages only - Rejected (Module 4) is a
    // terminal side-branch, not a stage, and would break the stepper's step numbering.
    const byStatus = PIPELINE_STATUSES.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    }));
    return {
      total: grouped.reduce((sum, g) => sum + g.count, 0),
      byStatus,
      rejected: counts.get(PoStatus.Rejected) ?? 0,
      recent: recent.items,
    };
  }

  async customerAccessStatus(id: string) {
    const po = await this.findOrThrow(id);
    return this.customerAccess.status(po.customerId.toString());
  }

  /** (Re)sends the customer-app invite for this PO's customer. */
  async inviteCustomer(id: string, actor: Actor) {
    const po = await this.findOrThrow(id);
    const result = await this.customerAccess.invite(po.customerId.toString());
    await this.record(actor, 'customer.invited', po, {
      status: result.status,
      emailed: result.emailed,
    });
    return result;
  }

  async getById(id: string) {
    return this.toResponse(await this.findOrThrow(id));
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    rawFiles: Express.Multer.File[],
    actor: Actor,
  ) {
    const po = await this.findOrThrow(id);
    const lockedMessage =
      'This PO has moved past Registration and can no longer be edited.';
    if (po.status !== PoStatus.Registration)
      throw new ConflictException(lockedMessage);

    const customer = await this.customers.findById(po.customerId);
    if (!customer) throw new NotFoundException('Customer record not found');
    if (dto.serviceType !== undefined)
      dto.serviceType = await this.resolveServiceType(dto.serviceType);

    const prepared = this.files.prepare(rawFiles);
    const existing = po.documents as StoredFileDoc[];
    const removeIds = new Set(dto.removeDocumentIds ?? []);
    const toRemove = existing.filter((d) => removeIds.has(d._id.toString()));
    if (toRemove.length !== removeIds.size) {
      throw new BadRequestException(
        'One or more documents to remove were not found on this PO',
      );
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const customerChanges: Record<string, string> = {};
    const track = (label: string, from: unknown, to: unknown | undefined) => {
      if (to !== undefined && to !== from)
        changes[label] = { from: clip(from), to: clip(to) };
    };
    const shown = po.customerDetails;
    track('customerName', shown.name, dto.customerName);
    track('address', shown.address, dto.address);
    track('location', shown.location ?? '', dto.location);
    track('phone', shown.phone, dto.phone);
    track('email', shown.email, dto.email?.toLowerCase());
    track('serviceType', po.serviceType, dto.serviceType);
    track('poInstructions', po.poInstructions, dto.poInstructions);
    if (dto.customerName !== undefined) customerChanges.name = dto.customerName;
    if (dto.address !== undefined) customerChanges.address = dto.address;
    if (dto.location !== undefined) customerChanges.location = dto.location;
    if (dto.phone !== undefined) customerChanges.phone = dto.phone;
    if (dto.email !== undefined) customerChanges.email = dto.email;
    const detailChanges = Object.fromEntries(
      Object.entries(customerChanges).map(([k, v]) => [
        `customerDetails.${k}`,
        v,
      ]),
    );

    const stored = await this.files.save(po.poNumber, 'documents', prepared);
    const remaining = existing.filter((d) => !removeIds.has(d._id.toString()));

    // The status + updatedAt filter makes the lock atomic: if the PO moved to
    // Inspection (or was edited elsewhere) since we read it, nothing is written.
    const updated = await this.poModel
      .findOneAndUpdate(
        { _id: po._id, status: PoStatus.Registration, updatedAt: po.updatedAt },
        {
          $set: {
            ...(dto.serviceType !== undefined
              ? { serviceType: dto.serviceType }
              : {}),
            ...(dto.poInstructions !== undefined
              ? { poInstructions: dto.poInstructions }
              : {}),
            ...detailChanges,
            documents: [...remaining, ...stored],
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      await Promise.all(
        stored.map((f) =>
          this.files.remove(po.poNumber, 'documents', f.storedName),
        ),
      );
      const fresh = await this.poModel.findById(po._id).exec();
      if (fresh && fresh.status !== PoStatus.Registration)
        throw new ConflictException(lockedMessage);
      throw new ConflictException(
        'This PO was changed by someone else. Reload and try again.',
      );
    }

    // Editing is only possible during Registration, so the customer record is still this
    // PO's own and is kept in step with it.
    if (Object.keys(customerChanges).length > 0)
      await this.customers.update(customer._id, customerChanges);

    await Promise.all(
      toRemove.map((d) =>
        this.files.remove(po.poNumber, 'documents', d.storedName),
      ),
    );

    await this.record(actor, 'po.updated', updated, {
      changes,
      documentsAdded: stored.map((f) => f.originalName),
      documentsRemoved: toRemove.map((d) => d.originalName),
    });
    return this.toResponse(updated);
  }

  async getDocumentFile(id: string, docId: string) {
    const po = await this.findOrThrow(id);
    const doc = (po.documents as StoredFileDoc[]).find(
      (d) => d._id.toString() === docId,
    );
    if (!doc) throw new NotFoundException('Document not found');
    return {
      path: this.files.pathFor(po.poNumber, 'documents', doc.storedName),
      name: doc.originalName,
      mimeType: doc.mimeType,
    };
  }
}
