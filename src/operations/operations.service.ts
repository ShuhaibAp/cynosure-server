import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
// exifr's shipped build only synthesizes a `default` export under Node's ESM/CJS interop
// (its .d.ts advertises named exports like `gps` that don't actually exist at runtime this
// way) - verified directly against the installed package, not assumed from the types.
import exifrDefault from 'exifr';
const exifr = exifrDefault as unknown as {
  gps(input: Buffer): Promise<{ latitude: number; longitude: number }>;
};
import { Model, Types } from 'mongoose';
import { Actor, AuditService } from '../common/audit/audit.service.js';
import { InspectionType } from '../common/enums/inspection.enum.js';
import { PoStatus } from '../common/enums/po-status.enum.js';
import { PoFilesService } from '../common/files/po-files.service.js';
import { StoredFileDoc } from '../common/files/stored-file.schema.js';
import { InspectionsService } from '../bd/inspections/inspections.service.js';
import { InspectionLineDoc } from '../bd/inspections/schemas/inspection.schema.js';
import { PurchaseOrderDocument } from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../bd/purchase-orders/purchase-orders.service.js';
import { QuotationsService } from '../bd/quotations/quotations.service.js';
import { ExpenseLineInputDto } from './dto/save-expenses.dto.js';
import { SaveOperationsDto } from './dto/save-operations.dto.js';
import {
  ExpenseLineDoc,
  GeoPhotoDoc,
  OperationsLineDoc,
  OperationsRecord,
  OperationsRecordDocument,
} from './schemas/operations-record.schema.js';

const CHANGED_ELSEWHERE =
  'This record was changed elsewhere. Reload the page and try again.';

type ExpenseField = 'collectionExpenses' | 'logisticsExpenses';

@Injectable()
export class OperationsService {
  constructor(
    @InjectModel(OperationsRecord.name)
    private model: Model<OperationsRecordDocument>,
    private pos: PurchaseOrdersService,
    private inspections: InspectionsService,
    private quotations: QuotationsService,
    private files: PoFilesService,
    private audit: AuditService,
  ) {}

  private async load(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const record = await this.model.findOne({ poId: po._id }).exec();
    return { po, record };
  }

  private isEditable(po: PurchaseOrderDocument, r: OperationsRecordDocument) {
    return !r.completedAt && po.status === PoStatus.Operations;
  }

  private requireEditable(
    po: PurchaseOrderDocument,
    r: OperationsRecordDocument | null,
  ): OperationsRecordDocument {
    if (!r)
      throw new NotFoundException(
        'Operations has not started work on this PO yet.',
      );
    if (!this.isEditable(po, r))
      throw new ConflictException(
        'This record can no longer be edited. It has already been completed.',
      );
    return r;
  }

  /** What still stands between this record and marking Operations complete. */
  private blockers(r: OperationsRecordDocument): string[] {
    const out: string[] = [];
    if (!r.acknowledged) out.push('Acknowledge the Inspection Report.');
    if (!r.pickupDate) out.push('Enter the Pickup Date.');
    if (r.lines.length > 0 && r.lines.some((l) => l.actualQuantity === null)) {
      out.push('Enter the actual quantity for every material.');
    }
    if (r.weighmentEmptyKg === null) out.push('Enter the Empty Weight (kg).');
    if (r.weighmentLoadedKg === null) out.push('Enter the Loaded Weight (kg).');
    if (!r.form6Number) out.push('Enter the Form 6 Number.');
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
      entityType: 'Operations',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  private toResponse(
    po: PurchaseOrderDocument,
    r: OperationsRecordDocument | null,
  ) {
    if (!r) {
      return {
        poNumber: po.poNumber,
        poStatus: po.status,
        canStart: po.status === PoStatus.Operations,
        operations: null,
      };
    }

    const editable = this.isEditable(po, r);
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      canStart: false,
      operations: {
        id: r._id.toString(),
        editable,
        acknowledged: r.acknowledged,
        acknowledgedAt: r.acknowledgedAt,
        acknowledgedBy: r.acknowledgedBy,
        pickupDate: r.pickupDate,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        invoiceAmount: r.invoiceAmount,
        ewayBillNumber: r.ewayBillNumber,
        form6Number: r.form6Number,
        form6Document: r.form6Document
          ? {
              id: (r.form6Document as StoredFileDoc)._id.toString(),
              name: r.form6Document.originalName,
              size: r.form6Document.size,
              mimeType: r.form6Document.mimeType,
            }
          : null,
        lrNumber: r.lrNumber,
        mplNumber: r.mplNumber,
        vehicleNumber: r.vehicleNumber,
        weighmentSlipEmptyNumber: r.weighmentSlipEmptyNumber,
        weighmentSlipLoadNumber: r.weighmentSlipLoadNumber,
        weighmentEmptyKg: r.weighmentEmptyKg,
        weighmentLoadedKg: r.weighmentLoadedKg,
        netWeightKg:
          r.weighmentEmptyKg !== null && r.weighmentLoadedKg !== null
            ? Math.round((r.weighmentLoadedKg - r.weighmentEmptyKg) * 100) / 100
            : null,
        padlockSerialNumber: r.padlockSerialNumber,
        lines: (r.lines as OperationsLineDoc[]).map((l) => ({
          id: l._id.toString(),
          materialName: l.materialName,
          uom: l.uom,
          clientQuantity: l.clientQuantity,
          inspectedQuantity: l.inspectedQuantity,
          actualQuantity: l.actualQuantity,
          remarks: l.remarks,
        })),
        collectionExpenses: (r.collectionExpenses as ExpenseLineDoc[]).map(
          (e) => ({
            id: e._id.toString(),
            description: e.description,
            amount: e.amount,
          }),
        ),
        logisticsExpenses: (r.logisticsExpenses as ExpenseLineDoc[]).map(
          (e) => ({
            id: e._id.toString(),
            description: e.description,
            amount: e.amount,
          }),
        ),
        photos: (r.photos as GeoPhotoDoc[]).map((p) => ({
          id: p._id.toString(),
          name: p.originalName,
          size: p.size,
          gps:
            p.gpsLat !== null && p.gpsLng !== null
              ? { lat: p.gpsLat, lng: p.gpsLng }
              : null,
          uploadedAt: p.uploadedAt,
        })),
        completedAt: r.completedAt,
        completedBy: r.completedBy,
        blockers: editable ? this.blockers(r) : [],
      },
    };
  }

  async get(poId: string) {
    const { po, record } = await this.load(poId);
    return this.toResponse(po, record);
  }

  /**
   * The material list is snapshotted once at start-time (FR-06.06/07 need Client, Inspected
   * AND Actual Quantity side by side). Onsite POs have a real Module 2 inspection with both
   * numbers already; a Virtual PO has none, so - the same reasoning Module 5 used for its
   * report - the Quotation's line quantity stands in for both (it is the only material record
   * that exists at all for a Virtual PO).
   */
  private async seedLines(po: PurchaseOrderDocument) {
    const inspection = await this.inspections.findCompleted(po._id);
    if (inspection && inspection.type === InspectionType.Onsite) {
      return (inspection.lines as InspectionLineDoc[]).map((l) => ({
        materialName: l.materialName,
        uom: l.uom,
        clientQuantity: l.clientQuantity,
        inspectedQuantity: l.inspectedQuantity ?? l.clientQuantity,
        actualQuantity: null,
        remarks: '',
      }));
    }
    const lines = await this.quotations.latestLines(po._id);
    return lines.map((l) => ({
      materialName: l.materialName,
      uom: l.uom,
      clientQuantity: l.quantity,
      inspectedQuantity: l.quantity,
      actualQuantity: null,
      remarks: '',
    }));
  }

  /** Starts Operations' work once the pickup request has generated the Inspection Report (FR-06.01). */
  async start(poId: string, actor: Actor) {
    const { po, record } = await this.load(poId);
    if (record)
      throw new ConflictException(
        'Operations has already started work on this PO.',
      );
    if (po.status !== PoStatus.Operations) {
      throw new ConflictException(
        'Operations work can start once the Inspection Report has been generated.',
      );
    }

    const lines = await this.seedLines(po);
    let created: OperationsRecordDocument;
    try {
      created = await this.model.create({
        poId: po._id,
        lines,
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'Operations has already started work on this PO.',
        );
      }
      throw err;
    }

    await this.record(actor, 'operations.started', po, { lines: lines.length });
    return this.toResponse(po, created);
  }

  async save(poId: string, dto: SaveOperationsDto, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const set: Record<string, unknown> = {};
    const dateField = (key: 'pickupDate' | 'invoiceDate', value?: string) => {
      if (value === undefined) return;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          message: `Enter a valid ${key === 'pickupDate' ? 'pickup' : 'invoice'} date`,
          errors: {
            [key]: `Enter a valid ${key === 'pickupDate' ? 'pickup' : 'invoice'} date`,
          },
        });
      }
      set[key] = d;
    };
    dateField('pickupDate', dto.pickupDate);
    dateField('invoiceDate', dto.invoiceDate);
    // Acknowledgement is one-way: once true it stays true even if a later save omits it.
    if (dto.acknowledged && !r.acknowledged) {
      set.acknowledged = true;
      set.acknowledgedAt = new Date();
      set.acknowledgedBy = actor.name;
    }
    for (const key of [
      'invoiceNumber',
      'invoiceAmount',
      'ewayBillNumber',
      'form6Number',
      'lrNumber',
      'mplNumber',
      'vehicleNumber',
      'weighmentSlipEmptyNumber',
      'weighmentSlipLoadNumber',
      'weighmentEmptyKg',
      'weighmentLoadedKg',
      'padlockSerialNumber',
    ] as const) {
      if (dto[key] !== undefined) set[key] = dto[key];
    }

    if (dto.lines) {
      const byId = new Map(dto.lines.map((l) => [l.id, l]));
      set.lines = (r.lines as OperationsLineDoc[]).map((l) => {
        const input = byId.get(l._id.toString());
        return {
          _id: l._id,
          materialName: l.materialName,
          uom: l.uom,
          clientQuantity: l.clientQuantity,
          inspectedQuantity: l.inspectedQuantity,
          actualQuantity:
            input?.actualQuantity !== undefined
              ? input.actualQuantity
              : l.actualQuantity,
          remarks: input?.remarks !== undefined ? input.remarks : l.remarks,
        };
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null, updatedAt: r.updatedAt },
        { $set: set },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(actor, 'operations.updated', po, {
      fields: Object.keys(set),
    });
    return this.toResponse(po, updated);
  }

  private async saveExpenses(
    poId: string,
    field: ExpenseField,
    dto: { lines: ExpenseLineInputDto[] },
    actor: Actor,
  ) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { [field]: dto.lines } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(actor, `operations.${field}_updated`, po, {
      count: dto.lines.length,
    });
    return this.toResponse(po, updated);
  }

  saveCollectionExpenses(
    poId: string,
    dto: { lines: ExpenseLineInputDto[] },
    actor: Actor,
  ) {
    return this.saveExpenses(poId, 'collectionExpenses', dto, actor);
  }

  saveLogisticsExpenses(
    poId: string,
    dto: { lines: ExpenseLineInputDto[] },
    actor: Actor,
  ) {
    return this.saveExpenses(poId, 'logisticsExpenses', dto, actor);
  }

  async uploadPhotos(
    poId: string,
    rawFiles: Express.Multer.File[],
    actor: Actor,
  ) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const prepared = this.files.prepare(rawFiles, 'photo');
    const saved = await this.files.save(po.poNumber, 'operations', prepared);
    const withGps = await Promise.all(
      saved.map(async (f, i) => {
        const gps = await extractGps(prepared[i].buffer);
        return { ...f, gpsLat: gps?.lat ?? null, gpsLng: gps?.lng ?? null };
      }),
    );

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $push: { photos: { $each: withGps } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await Promise.all(
        saved.map((f) =>
          this.files.remove(po.poNumber, 'operations', f.storedName),
        ),
      );
      throw new ConflictException(
        'This record can no longer be edited. It has already been completed.',
      );
    }

    await this.record(actor, 'operations.photos_added', po, {
      photos: saved.map((f) => f.originalName),
    });
    return this.toResponse(po, updated);
  }

  async removePhoto(poId: string, photoId: string, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const photo = (r.photos as GeoPhotoDoc[]).find(
      (p) => p._id.toString() === photoId,
    );
    if (!photo) throw new NotFoundException('Photo not found');

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $pull: { photos: { _id: photo._id } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException(
        'This record can no longer be edited. It has already been completed.',
      );

    await this.files.remove(po.poNumber, 'operations', photo.storedName);
    await this.record(actor, 'operations.photo_removed', po, {
      photo: photo.originalName,
    });
    return this.toResponse(po, updated);
  }

  async getPhotoFile(poId: string, photoId: string) {
    const { po, record } = await this.load(poId);
    const photo = (record?.photos as GeoPhotoDoc[] | undefined)?.find(
      (p) => p._id.toString() === photoId,
    );
    if (!photo) throw new NotFoundException('Photo not found');
    return {
      path: this.files.pathFor(po.poNumber, 'operations', photo.storedName),
      name: photo.originalName,
      mimeType: photo.mimeType,
    };
  }

  /** Optional scanned copy (PDF or photo) of the Form 6 manifest; a new upload replaces any existing one. */
  async uploadForm6Document(
    poId: string,
    rawFile: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);
    if (!rawFile) throw new BadRequestException('No file was uploaded.');

    const [prepared] = this.files.prepare([rawFile], 'attachment');
    const [saved] = await this.files.save(po.poNumber, 'operations', [
      prepared,
    ]);

    const previous = r.form6Document as StoredFileDoc | null;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { form6Document: saved } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await this.files.remove(po.poNumber, 'operations', saved.storedName);
      throw new ConflictException(
        'This record can no longer be edited. It has already been completed.',
      );
    }
    if (previous) {
      await this.files.remove(po.poNumber, 'operations', previous.storedName);
    }

    await this.record(actor, 'operations.form6_document_uploaded', po, {
      name: saved.originalName,
    });
    return this.toResponse(po, updated);
  }

  async removeForm6Document(poId: string, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);
    const existing = r.form6Document as StoredFileDoc | null;
    if (!existing) throw new NotFoundException('No Form 6 document to remove');

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { form6Document: null } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException(
        'This record can no longer be edited. It has already been completed.',
      );

    await this.files.remove(po.poNumber, 'operations', existing.storedName);
    await this.record(actor, 'operations.form6_document_removed', po, {
      name: existing.originalName,
    });
    return this.toResponse(po, updated);
  }

  async getForm6DocumentFile(poId: string) {
    const { po, record } = await this.load(poId);
    const doc = record?.form6Document as StoredFileDoc | null | undefined;
    if (!doc) throw new NotFoundException('Form 6 document not found');
    return {
      path: this.files.pathFor(po.poNumber, 'operations', doc.storedName),
      name: doc.originalName,
      mimeType: doc.mimeType,
    };
  }

  /** Locks the record and moves the PO on to Weighment (Module 8). */
  async complete(poId: string, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const blockers = this.blockers(r);
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Operations is not ready to be marked complete.',
        blockers,
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { completedAt: new Date(), completedBy: actor.name } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException(
        'This record has already been marked complete.',
      );

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Operations,
      PoStatus.Weighment,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: r._id },
        { $set: { completedAt: null, completedBy: null } },
      );
      throw new ConflictException(
        'This PO is no longer in the Operations stage.',
      );
    }

    await this.record(actor, 'operations.completed', moved);
    return this.toResponse(moved, updated);
  }
}

/** Best-effort EXIF GPS read; any failure (no EXIF, stripped metadata, odd file) just means no location. */
async function extractGps(
  buffer: Buffer,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(buffer);
    if (
      !gps ||
      typeof gps.latitude !== 'number' ||
      typeof gps.longitude !== 'number'
    )
      return null;
    return { lat: gps.latitude, lng: gps.longitude };
  } catch {
    return null;
  }
}
