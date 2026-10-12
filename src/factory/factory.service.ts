import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Actor, AuditService } from '../common/audit/audit.service.js';
import { PoStatus } from '../common/enums/po-status.enum.js';
import { Role } from '../common/enums/role.enum.js';
import { PoFilesService } from '../common/files/po-files.service.js';
import {
  StoredFile,
  StoredFileDoc,
} from '../common/files/stored-file.schema.js';
import { PurchaseOrderDocument } from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../bd/purchase-orders/purchase-orders.service.js';
import {
  OperationsLineDoc,
  OperationsRecord,
  OperationsRecordDocument,
} from '../operations/schemas/operations-record.schema.js';
import { AorService } from '../aor/aor.service.js';
import { WeighmentService } from '../weighment/weighment.service.js';
import { SaveFactoryDto, SaveTeardownLogDto } from './dto/save-factory.dto.js';
import {
  FactoryLineDoc,
  FactoryRecord,
  FactoryRecordDocument,
  TeardownEntryDoc,
} from './schemas/factory-record.schema.js';

const CHANGED_ELSEWHERE =
  'This record was changed elsewhere. Reload the page and try again.';
const NOT_EDITABLE =
  'This record can no longer be edited. It has already been completed.';

export type SlipKind = 'empty' | 'load';
const SLIP_FIELD = {
  empty: 'weighmentSlipEmpty',
  load: 'weighmentSlipLoad',
} as const;

// SoW matrix: the Teardown Log is Admin Create/Edit, Factory and Operations View. BD isn't
// shown it (the client has not confirmed wider visibility).
const TEARDOWN_VIEWERS: string[] = [Role.Admin, Role.Factory, Role.Operations];

const fileView = (f: StoredFile | null) =>
  f
    ? {
        id: (f as StoredFileDoc)._id.toString(),
        name: f.originalName,
        size: f.size,
        mimeType: f.mimeType,
      }
    : null;

const netKg = (empty: number | null, loaded: number | null) =>
  empty !== null && loaded !== null
    ? Math.round((loaded - empty) * 100) / 100
    : null;

@Injectable()
export class FactoryService {
  constructor(
    @InjectModel(FactoryRecord.name)
    private model: Model<FactoryRecordDocument>,
    @InjectModel(OperationsRecord.name)
    private operationsModel: Model<OperationsRecordDocument>,
    private pos: PurchaseOrdersService,
    private files: PoFilesService,
    private audit: AuditService,
    private weighment: WeighmentService,
    private aor: AorService,
  ) {}

  private async load(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const record = await this.model.findOne({ poId: po._id }).exec();
    return { po, record };
  }

  private isEditable(po: PurchaseOrderDocument, r: FactoryRecordDocument) {
    return !r.completedAt && po.status === PoStatus.Factory;
  }

  private requireEditable(
    po: PurchaseOrderDocument,
    r: FactoryRecordDocument | null,
  ): FactoryRecordDocument {
    if (!r)
      throw new NotFoundException(
        'Factory has not started work on this PO yet.',
      );
    if (!this.isEditable(po, r)) throw new ConflictException(NOT_EDITABLE);
    return r;
  }

  /** What still stands between this record and marking Factory complete (BR-07.01). */
  private blockers(r: FactoryRecordDocument): string[] {
    const out: string[] = [];
    if (!r.weighmentSlipEmpty)
      out.push('Upload the scanned Weighment Slip – Empty.');
    if (!r.weighmentSlipLoad)
      out.push('Upload the scanned Weighment Slip – Load.');
    if (r.weighmentEmptyKg === null) out.push('Enter the Empty Weight (kg).');
    if (r.weighmentLoadedKg === null) out.push('Enter the Loaded Weight (kg).');
    if (r.lines.length > 0 && r.lines.some((l) => l.processedQuantity === null))
      out.push('Enter the processed quantity for every material.');
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
      entityType: 'Factory',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  private async operationsSummary(po: PurchaseOrderDocument) {
    const ops = await this.operationsModel.findOne({ poId: po._id }).exec();
    if (!ops) return null;
    return {
      weighmentEmptyKg: ops.weighmentEmptyKg,
      weighmentLoadedKg: ops.weighmentLoadedKg,
      netWeightKg: netKg(ops.weighmentEmptyKg, ops.weighmentLoadedKg),
      completedAt: ops.completedAt,
    };
  }

  private async toResponse(
    po: PurchaseOrderDocument,
    r: FactoryRecordDocument | null,
    role: string,
  ) {
    const base = {
      poNumber: po.poNumber,
      poStatus: po.status,
      // FR-07.02: PO Instructions, read-only, as last edited (Module 05 syncs them to the PO).
      poInstructions: po.poInstructions,
      canWriteTeardownLog: role === Role.Admin,
    };
    if (!r) {
      return {
        ...base,
        canStart: po.status === PoStatus.Factory,
        factory: null,
      };
    }

    const editable = this.isEditable(po, r);
    return {
      ...base,
      canStart: false,
      factory: {
        id: r._id.toString(),
        editable,
        weighmentEmptyKg: r.weighmentEmptyKg,
        weighmentLoadedKg: r.weighmentLoadedKg,
        netWeightKg: netKg(r.weighmentEmptyKg, r.weighmentLoadedKg),
        outputWeightKg: r.outputWeightKg,
        residueWeightKg: r.residueWeightKg,
        operationsWeights: await this.operationsSummary(po),
        weighmentSlipEmpty: fileView(r.weighmentSlipEmpty),
        weighmentSlipLoad: fileView(r.weighmentSlipLoad),
        lines: (r.lines as FactoryLineDoc[]).map((l) => ({
          id: l._id.toString(),
          materialName: l.materialName,
          uom: l.uom,
          clientQuantity: l.clientQuantity,
          inspectedQuantity: l.inspectedQuantity,
          actualQuantity: l.actualQuantity,
          processedQuantity: l.processedQuantity,
          remarks: l.remarks,
        })),
        photos: (r.photos as StoredFileDoc[]).map((p) => ({
          id: p._id.toString(),
          name: p.originalName,
          size: p.size,
          uploadedAt: p.uploadedAt,
        })),
        teardownLog: TEARDOWN_VIEWERS.includes(role)
          ? (r.teardownLog as TeardownEntryDoc[]).map((t) => ({
              id: t._id.toString(),
              componentName: t.componentName,
              quantity: t.quantity,
              condition: t.condition,
              date: t.date,
              technician: t.technician,
              remarks: t.remarks,
            }))
          : null,
        completedAt: r.completedAt,
        completedBy: r.completedBy,
        blockers: editable ? this.blockers(r) : [],
      },
    };
  }

  async get(poId: string, role: string) {
    const { po, record } = await this.load(poId);
    return this.toResponse(po, record, role);
  }

  /** Starts Factory's work once Operations has completed and the PO reached the Factory stage. */
  async start(poId: string, actor: Actor) {
    const { po, record } = await this.load(poId);
    if (record)
      throw new ConflictException(
        'Factory has already started work on this PO.',
      );
    if (po.status !== PoStatus.Factory) {
      throw new ConflictException(
        'Factory work can start once Operations has been marked complete.',
      );
    }

    // FR-07.01: the same material list Operations worked from, snapshotted once.
    const ops = await this.operationsModel.findOne({ poId: po._id }).exec();
    const lines = ((ops?.lines ?? []) as OperationsLineDoc[]).map((l) => ({
      materialName: l.materialName,
      uom: l.uom,
      clientQuantity: l.clientQuantity,
      inspectedQuantity: l.inspectedQuantity,
      actualQuantity: l.actualQuantity,
      processedQuantity: null,
      remarks: '',
    }));

    let created: FactoryRecordDocument;
    try {
      created = await this.model.create({
        poId: po._id,
        lines,
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(
          'Factory has already started work on this PO.',
        );
      throw err;
    }

    await this.record(actor, 'factory.started', po, { lines: lines.length });
    return this.toResponse(po, created, actor.role);
  }

  async save(poId: string, dto: SaveFactoryDto, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const set: Record<string, unknown> = {};
    if (dto.weighmentEmptyKg !== undefined)
      set.weighmentEmptyKg = dto.weighmentEmptyKg;
    if (dto.weighmentLoadedKg !== undefined)
      set.weighmentLoadedKg = dto.weighmentLoadedKg;
    if (dto.outputWeightKg !== undefined)
      set.outputWeightKg = dto.outputWeightKg;
    if (dto.residueWeightKg !== undefined)
      set.residueWeightKg = dto.residueWeightKg;

    if (dto.lines) {
      const byId = new Map(dto.lines.map((l) => [l.id, l]));
      set.lines = (r.lines as FactoryLineDoc[]).map((l) => {
        const input = byId.get(l._id.toString());
        return {
          _id: l._id,
          materialName: l.materialName,
          uom: l.uom,
          clientQuantity: l.clientQuantity,
          inspectedQuantity: l.inspectedQuantity,
          actualQuantity: l.actualQuantity,
          processedQuantity:
            input?.processedQuantity !== undefined
              ? input.processedQuantity
              : l.processedQuantity,
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

    await this.record(actor, 'factory.updated', po, {
      fields: Object.keys(set),
    });
    return this.toResponse(po, updated, actor.role);
  }

  private slipKind(kind: string): SlipKind {
    if (kind !== 'empty' && kind !== 'load')
      throw new NotFoundException('Unknown weighment slip');
    return kind;
  }

  /** Scanned weighment slip (PDF or photo); a new upload replaces the previous one. */
  async uploadSlip(
    poId: string,
    kindParam: string,
    rawFile: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    const kind = this.slipKind(kindParam);
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);
    if (!rawFile) throw new BadRequestException('No file was uploaded.');

    const field = SLIP_FIELD[kind];
    const [prepared] = this.files.prepare([rawFile], 'attachment');
    const [saved] = await this.files.save(po.poNumber, 'factory', [prepared]);
    const previous = r[field];

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { [field]: saved } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await this.files.remove(po.poNumber, 'factory', saved.storedName);
      throw new ConflictException(NOT_EDITABLE);
    }
    if (previous)
      await this.files.remove(po.poNumber, 'factory', previous.storedName);

    await this.record(actor, `factory.slip_${kind}_uploaded`, po, {
      name: saved.originalName,
    });
    return this.toResponse(po, updated, actor.role);
  }

  async removeSlip(poId: string, kindParam: string, actor: Actor) {
    const kind = this.slipKind(kindParam);
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);
    const field = SLIP_FIELD[kind];
    const existing = r[field];
    if (!existing) throw new NotFoundException('No weighment slip to remove');

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $set: { [field]: null } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(NOT_EDITABLE);

    await this.files.remove(po.poNumber, 'factory', existing.storedName);
    await this.record(actor, `factory.slip_${kind}_removed`, po, {
      name: existing.originalName,
    });
    return this.toResponse(po, updated, actor.role);
  }

  async getSlipFile(poId: string, kindParam: string) {
    const kind = this.slipKind(kindParam);
    const { po, record } = await this.load(poId);
    const doc = record?.[SLIP_FIELD[kind]];
    if (!doc) throw new NotFoundException('Weighment slip not found');
    return {
      path: this.files.pathFor(po.poNumber, 'factory', doc.storedName),
      name: doc.originalName,
      mimeType: doc.mimeType,
    };
  }

  async uploadPhotos(
    poId: string,
    rawFiles: Express.Multer.File[],
    actor: Actor,
  ) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const prepared = this.files.prepare(rawFiles, 'photo');
    const saved = await this.files.save(po.poNumber, 'factory', prepared);

    const updated = await this.model
      .findOneAndUpdate(
        { _id: r._id, completedAt: null },
        { $push: { photos: { $each: saved } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await Promise.all(
        saved.map((f) =>
          this.files.remove(po.poNumber, 'factory', f.storedName),
        ),
      );
      throw new ConflictException(NOT_EDITABLE);
    }

    await this.record(actor, 'factory.photos_added', po, {
      photos: saved.map((f) => f.originalName),
    });
    return this.toResponse(po, updated, actor.role);
  }

  async removePhoto(poId: string, photoId: string, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);
    const photo = (r.photos as StoredFileDoc[]).find(
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
    if (!updated) throw new ConflictException(NOT_EDITABLE);

    await this.files.remove(po.poNumber, 'factory', photo.storedName);
    await this.record(actor, 'factory.photo_removed', po, {
      photo: photo.originalName,
    });
    return this.toResponse(po, updated, actor.role);
  }

  async getPhotoFile(poId: string, photoId: string) {
    const { po, record } = await this.load(poId);
    const photo = (record?.photos as StoredFileDoc[] | undefined)?.find(
      (p) => p._id.toString() === photoId,
    );
    if (!photo) throw new NotFoundException('Photo not found');
    return {
      path: this.files.pathFor(po.poNumber, 'factory', photo.storedName),
      name: photo.originalName,
      mimeType: photo.mimeType,
    };
  }

  /** Admin-only (BR-07.02). Replaces the whole log; allowed any time after Factory has started. */
  async saveTeardownLog(poId: string, dto: SaveTeardownLogDto, actor: Actor) {
    const { po, record } = await this.load(poId);
    if (!record)
      throw new NotFoundException(
        'Factory has not started work on this PO yet.',
      );

    const entries = dto.entries.map((e) => ({
      componentName: e.componentName,
      quantity: e.quantity,
      condition: e.condition ?? '',
      date: e.date ? new Date(e.date) : null,
      technician: e.technician ?? '',
      remarks: e.remarks ?? '',
    }));
    const updated = await this.model
      .findOneAndUpdate(
        { _id: record._id },
        { $set: { teardownLog: entries } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(actor, 'factory.teardown_log_updated', po, {
      rows: entries.length,
    });
    return this.toResponse(po, updated, actor.role);
  }

  /** Locks the record and moves the PO on to the Weighment stage (Module 8). */
  async complete(poId: string, actor: Actor) {
    const { po, record: found } = await this.load(poId);
    const r = this.requireEditable(po, found);

    const blockers = this.blockers(r);
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Factory is not ready to be marked complete.',
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
      PoStatus.Factory,
      PoStatus.Weighment,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: r._id },
        { $set: { completedAt: null, completedBy: null } },
      );
      throw new ConflictException('This PO is no longer in the Factory stage.');
    }

    await this.record(actor, 'factory.completed', moved);

    // Both Operations and Factory are now complete: the AOR (with its T+2 clock) is created and
    // the automatic weighment cross-check runs (Modules 9 and 8).
    await this.aor.createFor(moved, actor);
    await this.weighment.run(moved, actor);
    return this.toResponse(moved, updated, actor.role);
  }
}
