import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { readFile } from 'node:fs/promises';
import { Model, Types } from 'mongoose';
import { Actor, AuditService } from '../../common/audit/audit.service.js';
import { PickupStatus } from '../../common/enums/pickup-status.enum.js';
import { PoStatus } from '../../common/enums/po-status.enum.js';
import { CustomersService } from '../../common/customers/customers.service.js';
import { PoFilesService } from '../../common/files/po-files.service.js';
import {
  InspectionsService,
  photoTag,
} from '../inspections/inspections.service.js';
import { InspectionPhotoDoc } from '../inspections/schemas/inspection.schema.js';
import { PurchaseOrderDocument } from '../purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { QuotationsService } from '../quotations/quotations.service.js';
import { SavePickupRequestDto } from './dto/save-pickup-request.dto.js';
import { PickupReportPdfService } from './pickup-report-pdf.service.js';
import {
  PickupRequest,
  PickupRequestDocument,
} from './schemas/pickup-request.schema.js';

const CHANGED_ELSEWHERE =
  'This pickup request was changed elsewhere. Reload the page and try again.';

@Injectable()
export class PickupRequestsService {
  constructor(
    @InjectModel(PickupRequest.name)
    private model: Model<PickupRequestDocument>,
    private pos: PurchaseOrdersService,
    private customers: CustomersService,
    private inspections: InspectionsService,
    private quotations: QuotationsService,
    private files: PoFilesService,
    private pdf: PickupReportPdfService,
    private audit: AuditService,
  ) {}

  private async load(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const pickup = await this.model.findOne({ poId: po._id }).exec();
    return { po, pickup };
  }

  private isEditable(po: PurchaseOrderDocument, p: PickupRequestDocument) {
    return p.status === PickupStatus.Draft && po.status === PoStatus.Pickup;
  }

  private requireEditable(
    po: PurchaseOrderDocument,
    p: PickupRequestDocument | null,
  ): PickupRequestDocument {
    if (!p)
      throw new NotFoundException(
        'No pickup request has been started for this PO.',
      );
    if (!this.isEditable(po, p))
      throw new ConflictException(
        'This pickup request can no longer be edited. It has already been generated.',
      );
    return p;
  }

  /** What still stands between this pickup request and generating the report (AC-05.03). */
  private blockers(p: PickupRequestDocument): string[] {
    const out: string[] = [];
    if (!p.collectionDateTime) out.push('Enter the collection date and time.');
    if (!p.contactName.trim()) out.push('Enter the point of contact name.');
    if (!p.contactPhone.trim())
      out.push('Enter the point of contact phone number.');
    return out;
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
      entityType: 'PickupRequest',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  private toResponse(
    po: PurchaseOrderDocument,
    p: PickupRequestDocument | null,
  ) {
    if (!p) {
      return {
        poNumber: po.poNumber,
        poStatus: po.status,
        canStart: po.status === PoStatus.Pickup,
        pickup: null,
      };
    }

    const editable = this.isEditable(po, p);
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      canStart: false,
      pickup: {
        id: p._id.toString(),
        status: p.status,
        editable,
        collectionDateTime: p.collectionDateTime,
        contactName: p.contactName,
        contactPhone: p.contactPhone,
        // Always the PO's live value (FR-05.02/03) - never a stale copy on this doc.
        poInstructions: po.poInstructions,
        generatedAt: p.generatedAt,
        generatedBy: p.generatedBy,
        canDownload: p.status === PickupStatus.Generated,
        blockers: editable ? this.blockers(p) : [],
      },
    };
  }

  async get(poId: string) {
    const { po, pickup } = await this.load(poId);
    return this.toResponse(po, pickup);
  }

  /** Starts the request once the client has approved (FR-05.01: PO is in the Pickup stage). */
  async start(poId: string, actor: Actor) {
    const { po, pickup } = await this.load(poId);
    if (pickup)
      throw new ConflictException(
        'A pickup request has already been started for this PO.',
      );
    if (po.status !== PoStatus.Pickup) {
      throw new ConflictException(
        'A pickup request can be started once the client approves the quotation.',
      );
    }

    let created: PickupRequestDocument;
    try {
      created = await this.model.create({
        poId: po._id,
        status: PickupStatus.Draft,
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'A pickup request has already been started for this PO.',
        );
      }
      throw err;
    }

    await this.record(actor, 'pickup.created', po);
    return this.toResponse(po, created);
  }

  async save(poId: string, dto: SavePickupRequestDto, actor: Actor) {
    const { po, pickup: found } = await this.load(poId);
    const p = this.requireEditable(po, found);

    const set: Record<string, unknown> = {};
    if (dto.collectionDateTime !== undefined) {
      const d = new Date(dto.collectionDateTime);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Enter a valid collection date and time',
          errors: {
            collectionDateTime: 'Enter a valid collection date and time',
          },
        });
      }
      set.collectionDateTime = d;
    }
    if (dto.contactName !== undefined) set.contactName = dto.contactName;
    if (dto.contactPhone !== undefined) set.contactPhone = dto.contactPhone;

    const updated = await this.model
      .findOneAndUpdate(
        { _id: p._id, status: PickupStatus.Draft, updatedAt: p.updatedAt },
        { $set: set },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    // Bidirectional sync (FR-05.03): every save that includes it writes straight back to the PO.
    let updatedPo = po;
    if (dto.poInstructions !== undefined) {
      updatedPo = await this.pos.updatePoInstructions(
        po._id,
        dto.poInstructions,
        actor,
      );
    }

    await this.record(actor, 'pickup.updated', updatedPo, {
      fields: Object.keys(set),
    });
    return this.toResponse(updatedPo, updated);
  }

  /** Locks the request, builds the Inspection Report, and pushes the PO to Operations (BR-05.02). */
  async generate(poId: string, actor: Actor) {
    const { po, pickup: found } = await this.load(poId);
    const p = this.requireEditable(po, found);

    const blockers = this.blockers(p);
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'The pickup request is not ready to be generated.',
        blockers,
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: p._id, status: PickupStatus.Draft },
        {
          $set: {
            status: PickupStatus.Generated,
            generatedAt: new Date(),
            generatedBy: actor.name,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException(
        'This pickup request has already been generated.',
      );

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Pickup,
      PoStatus.Operations,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: p._id },
        {
          $set: {
            status: PickupStatus.Draft,
            generatedAt: null,
            generatedBy: null,
          },
        },
      );
      throw new ConflictException('This PO is no longer in the Pickup stage.');
    }

    await this.record(actor, 'pickup.generated', moved);
    return this.toResponse(moved, updated);
  }

  /** The report is only ever produced once generated: no bypass, mirroring the quotation PDF gate. */
  async getReportFile(poId: string, actor: Actor) {
    const { po, pickup } = await this.load(poId);
    if (!pickup)
      throw new NotFoundException(
        'No pickup request has been started for this PO.',
      );
    if (pickup.status !== PickupStatus.Generated) {
      throw new ConflictException(
        'The Inspection Report is available once the pickup request has been generated.',
      );
    }
    const customer = await this.customers.findById(po.customerId);
    if (!customer) throw new NotFoundException('Customer record not found');

    const [lines, inspection] = await Promise.all([
      this.quotations.latestLines(po._id),
      this.inspections.findCompleted(po._id),
    ]);

    // A photo whose file went missing on disk is skipped rather than failing the whole report.
    const photoDocs = (inspection?.photos ?? []) as InspectionPhotoDoc[];
    const photos: Array<{ buffer: Buffer; caption: string }> = [];
    for (const photo of photoDocs) {
      const buf = await readFile(
        this.files.pathFor(po.poNumber, 'inspection', photo.storedName),
      ).catch(() => null);
      if (buf && inspection)
        photos.push({ buffer: buf, caption: photoTag(inspection, photo) });
    }

    const buffer = await this.pdf.build({
      poNumber: po.poNumber,
      serviceType: po.serviceType,
      poInstructions: po.poInstructions,
      customer: {
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        email: customer.email,
      },
      lines: lines.map((l) => ({
        materialName: l.materialName,
        uom: l.uom,
        quantity: l.quantity,
      })),
      collectionDateTime: pickup.collectionDateTime,
      contactName: pickup.contactName,
      contactPhone: pickup.contactPhone,
      generatedAt: pickup.generatedAt,
      photos,
    });

    await this.record(actor, 'pickup.report_downloaded', po);
    return { buffer, filename: `Inspection-Report-${po.poNumber}.pdf` };
  }
}
