import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Actor, AuditService } from '../../common/audit/audit.service.js';
import { InspectionType } from '../../common/enums/inspection.enum.js';
import { PoStatus } from '../../common/enums/po-status.enum.js';
import {
  decodeName,
  PoFilesService,
} from '../../common/files/po-files.service.js';
import { PurchaseOrderDocument } from '../purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { UomsService } from '../uoms/uoms.service.js';
import { ImportListDto } from './dto/import-list.dto.js';
import { SaveInspectionDto } from './dto/save-inspection.dto.js';
import { SavePhotoTagsDto } from './dto/save-photo-tags.dto.js';
import { SaveRemarksDto } from './dto/save-remarks.dto.js';
import { StartInspectionDto } from './dto/start-inspection.dto.js';
import {
  Column,
  COLUMN_LABELS,
  extractRows,
  previewList,
  readMatrix,
} from './inspection-list.parser.js';
import {
  Inspection,
  InspectionDocument,
  InspectionLineDoc,
  InspectionPhotoDoc,
} from './schemas/inspection.schema.js';

const CHANGED_ELSEWHERE =
  'This inspection was changed elsewhere. Reload the page and try again.';
const NOT_EDITABLE = 'This inspection is complete and can no longer be edited.';

/** A plain copy of a photo subdocument, safe to spread into an update. */
function retag(p: InspectionPhotoDoc) {
  return {
    _id: p._id,
    originalName: p.originalName,
    storedName: p.storedName,
    mimeType: p.mimeType,
    size: p.size,
    uploadedAt: p.uploadedAt,
  };
}

/** What a photo is called: the tagged material's current name, else the typed name, else "" (untagged). */
export function photoTag(
  inspection: InspectionDocument,
  photo: InspectionPhotoDoc,
): string {
  if (photo.lineId) {
    const line = (inspection.lines as InspectionLineDoc[]).find((l) =>
      l._id.equals(photo.lineId!),
    );
    if (line) return line.materialName;
  }
  return photo.label;
}

@Injectable()
export class InspectionsService {
  constructor(
    @InjectModel(Inspection.name) private model: Model<InspectionDocument>,
    private uoms: UomsService,
    private pos: PurchaseOrdersService,
    private files: PoFilesService,
    private audit: AuditService,
  ) {}

  private async load(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const inspection = await this.model.findOne({ poId: po._id }).exec();
    return { po, inspection };
  }

  /** Data entry is open only for an in-progress Onsite inspection. */
  private requireEditable(
    po: PurchaseOrderDocument,
    inspection: InspectionDocument | null,
  ): InspectionDocument {
    if (!inspection)
      throw new NotFoundException(
        'Inspection has not been started for this PO.',
      );
    if (inspection.type !== InspectionType.Onsite) {
      throw new ConflictException(
        'A virtual inspection has no inspection data.',
      );
    }
    if (inspection.completedAt || po.status !== PoStatus.Inspection)
      throw new ConflictException(NOT_EDITABLE);
    return inspection;
  }

  /** What still stands between this inspection and the Quotation stage (FR-02.08, FR-02.10). */
  private blockers(inspection: InspectionDocument): string[] {
    const out: string[] = [];
    if (!inspection.acknowledged)
      out.push('Tick "I acknowledge that the inspection process is complete".');
    if (inspection.lines.length === 0)
      out.push('Add at least one material to the inspection list.');
    else if (inspection.lines.some((l) => l.inspectedQuantity === null)) {
      out.push('Enter the inspected quantity for every material.');
    }
    if (inspection.expenseTotal === null)
      out.push('Enter the inspection expense.');
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
      entityType: 'Inspection',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  private toResponse(
    po: PurchaseOrderDocument,
    inspection: InspectionDocument | null,
  ) {
    if (!inspection)
      return { poNumber: po.poNumber, poStatus: po.status, inspection: null };

    const editable =
      inspection.type === InspectionType.Onsite &&
      !inspection.completedAt &&
      po.status === PoStatus.Inspection;
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      inspection: {
        type: inspection.type,
        editable,
        completed: inspection.completedAt !== null,
        completedAt: inspection.completedAt,
        acknowledged: inspection.acknowledged,
        acknowledgedAt: inspection.acknowledgedAt,
        acknowledgedBy: inspection.acknowledgedBy,
        expenseTotal: inspection.expenseTotal,
        lines: (inspection.lines as InspectionLineDoc[]).map((l) => ({
          id: l._id.toString(),
          materialName: l.materialName,
          uom: l.uom,
          clientQuantity: l.clientQuantity,
          inspectedQuantity: l.inspectedQuantity,
          remarks: l.remarks,
        })),
        photos: (inspection.photos as InspectionPhotoDoc[]).map((p) => ({
          id: p._id.toString(),
          name: p.originalName,
          size: p.size,
          uploadedAt: p.uploadedAt,
          lineId: p.lineId ? p.lineId.toString() : null,
          label: p.label,
          tag: photoTag(inspection, p),
        })),
        blockers: editable ? this.blockers(inspection) : [],
      },
    };
  }

  /** The finished inspection of a PO (the source of its quotation lines), or null until it is complete. */
  findCompleted(poId: Types.ObjectId) {
    return this.model.findOne({ poId, completedAt: { $ne: null } }).exec();
  }

  async get(poId: string) {
    const { po, inspection } = await this.load(poId);
    return this.toResponse(po, inspection);
  }

  /** Choosing the type is what moves a PO out of Registration (Virtual goes straight to Quotation). */
  async start(poId: string, dto: StartInspectionDto, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    const alreadyStarted = 'Inspection has already been started for this PO.';
    if (po.status !== PoStatus.Registration)
      throw new ConflictException(alreadyStarted);

    const virtual = dto.type === InspectionType.Virtual;
    let inspection: InspectionDocument;
    try {
      inspection = await this.model.create({
        poId: po._id,
        type: dto.type,
        createdBy: new Types.ObjectId(actor.userId),
        completedAt: virtual ? new Date() : null,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(alreadyStarted);
      throw err;
    }

    const next = virtual ? PoStatus.Quotation : PoStatus.Inspection;
    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Registration,
      next,
    );
    if (!moved) {
      await this.model.deleteOne({ _id: inspection._id });
      throw new ConflictException(alreadyStarted);
    }

    await this.record(actor, 'inspection.started', moved, {
      type: dto.type,
      movedTo: next,
    });
    return this.toResponse(moved, inspection);
  }

  async save(poId: string, dto: SaveInspectionDto, actor: Actor) {
    const { po, inspection: found } = await this.load(poId);
    const inspection = this.requireEditable(po, found);

    const existing = new Map(
      (inspection.lines as InspectionLineDoc[]).map((l) => [
        l._id.toString(),
        l,
      ]),
    );
    const units = await this.uoms.resolve(dto.lines.map((l) => l.uom));
    const unitErrors: Record<string, string> = {};
    units.forEach((u, i) => {
      if (!u) unitErrors[`lines.${i}.uom`] = 'Select a valid unit';
    });
    if (Object.keys(unitErrors).length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: Object.values(unitErrors),
        errors: unitErrors,
      });
    }

    const used = new Set<string>();
    const lines = dto.lines.map((line, i) => {
      const prior =
        line.id && !used.has(line.id) ? existing.get(line.id) : undefined;
      if (prior) used.add(line.id!);
      return {
        _id: prior?._id ?? new Types.ObjectId(),
        materialName: line.materialName,
        uom: units[i]!,
        clientQuantity: line.clientQuantity,
        // Inspected Quantity stays read-only until the acknowledgement is ticked (BR-02.01).
        inspectedQuantity: dto.acknowledged
          ? (line.inspectedQuantity ?? null)
          : (prior?.inspectedQuantity ?? null),
        remarks: line.remarks ?? '',
      };
    });

    // A photo tagged to a row that was just deleted keeps its name as a typed label instead of
    // silently becoming untagged.
    const keptIds = new Set(lines.map((l) => l._id.toString()));
    const photos = (inspection.photos as InspectionPhotoDoc[]).map((p) => {
      if (!p.lineId || keptIds.has(p.lineId.toString())) return p;
      return { ...retag(p), lineId: null, label: photoTag(inspection, p) };
    });
    const photosChanged = photos.some(
      (p, i) => p !== (inspection.photos as InspectionPhotoDoc[])[i],
    );

    const keepAck = dto.acknowledged && inspection.acknowledged;
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: inspection._id,
          completedAt: null,
          updatedAt: inspection.updatedAt,
        },
        {
          $set: {
            lines,
            acknowledged: dto.acknowledged,
            acknowledgedAt: dto.acknowledged
              ? keepAck
                ? inspection.acknowledgedAt
                : new Date()
              : null,
            acknowledgedBy: dto.acknowledged
              ? keepAck
                ? inspection.acknowledgedBy
                : actor.name
              : null,
            expenseTotal: dto.expenseTotal ?? null,
            ...(photosChanged ? { photos } : {}),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(actor, 'inspection.updated', po, {
      lines: lines.length,
      acknowledged: dto.acknowledged,
      expenseTotal: updated.expenseTotal,
    });
    return this.toResponse(po, updated);
  }

  /**
   * Two-step column mapping (reused by every spreadsheet upload, not just this one): called
   * once with no mapping fields, it never guesses silently - it returns a preview of the file
   * plus a suggested mapping for the BD user to confirm or fix in a modal. Called again with
   * `confirmed` set, it builds rows from exactly the mapping the user chose. Nothing is saved
   * either way; the caller merges the returned rows into the table itself.
   */
  async importList(
    poId: string,
    file: Express.Multer.File | undefined,
    dto: ImportListDto,
  ) {
    if (!file) throw new BadRequestException('Choose a file to upload.');
    const { po, inspection } = await this.load(poId);
    this.requireEditable(po, inspection);
    const matrix = await readMatrix(file.buffer, decodeName(file.originalname));

    if (!dto.confirmed) {
      return {
        mode: 'preview' as const,
        labels: COLUMN_LABELS,
        ...previewList(matrix),
      };
    }

    const columns = {
      materialName:
        dto.materialNameCol === -1 ? null : (dto.materialNameCol ?? null),
      uom: dto.uomCol === -1 ? null : (dto.uomCol ?? null),
      clientQuantity:
        dto.clientQuantityCol === -1 ? null : (dto.clientQuantityCol ?? null),
    } satisfies Record<Column, number | null>;
    const headerRow = dto.headerRow ?? -1;
    const maxCol = Math.max(0, ...matrix.map((r) => r.length)) - 1;
    for (const [key, col] of Object.entries(columns)) {
      if (col !== null && (col < 0 || col > maxCol)) {
        throw new BadRequestException(
          `${COLUMN_LABELS[key as Column]} points at a column that isn't in this file.`,
        );
      }
    }

    return {
      mode: 'rows' as const,
      ...extractRows(matrix, headerRow, columns, await this.uoms.list()),
    };
  }

  async complete(poId: string, actor: Actor) {
    const { po, inspection: found } = await this.load(poId);
    const inspection = this.requireEditable(po, found);

    const blockers = this.blockers(inspection);
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'The inspection is not ready to be completed.',
        blockers,
      });
    }

    const done = await this.model
      .findOneAndUpdate(
        {
          _id: inspection._id,
          completedAt: null,
          updatedAt: inspection.updatedAt,
        },
        { $set: { completedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!done) throw new ConflictException(CHANGED_ELSEWHERE);

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Inspection,
      PoStatus.Quotation,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: inspection._id },
        { $set: { completedAt: null } },
      );
      throw new ConflictException(
        'This PO is no longer in the Inspection stage.',
      );
    }

    await this.record(actor, 'inspection.completed', moved, {
      lines: done.lines.length,
      expenseTotal: done.expenseTotal,
      movedTo: PoStatus.Quotation,
    });
    return this.toResponse(moved, done);
  }

  async addPhotos(poId: string, rawFiles: Express.Multer.File[], actor: Actor) {
    if (rawFiles.length === 0)
      throw new BadRequestException('Choose at least one photo.');
    const { po, inspection: found } = await this.load(poId);
    const inspection = this.requireEditable(po, found);

    const saved = await this.files.save(
      po.poNumber,
      'inspection',
      this.files.prepare(rawFiles, 'photo'),
    );
    const updated = await this.model
      .findOneAndUpdate(
        { _id: inspection._id, completedAt: null },
        { $push: { photos: { $each: saved } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await Promise.all(
        saved.map((f) =>
          this.files.remove(po.poNumber, 'inspection', f.storedName),
        ),
      );
      throw new ConflictException(NOT_EDITABLE);
    }

    await this.record(actor, 'inspection.photos_added', po, {
      photos: saved.map((f) => f.originalName),
    });
    return this.toResponse(po, updated);
  }

  /**
   * Names what each photo shows - a listed material or a typed name (for bundled/general shots).
   * Picking a material clears any typed name and vice versa; both empty means untagged.
   */
  async saveTags(poId: string, dto: SavePhotoTagsDto, actor: Actor) {
    const { po, inspection: found } = await this.load(poId);
    const inspection = this.requireEditable(po, found);

    const lineIds = new Set(
      (inspection.lines as InspectionLineDoc[]).map((l) => l._id.toString()),
    );
    const byId = new Map(dto.photos.map((t) => [t.id, t]));
    const unknown = dto.photos.find(
      (t) =>
        !(inspection.photos as InspectionPhotoDoc[]).some(
          (p) => p._id.toString() === t.id,
        ),
    );
    if (unknown) throw new NotFoundException('Photo not found');
    const badLine = dto.photos.find((t) => t.lineId && !lineIds.has(t.lineId));
    if (badLine) {
      throw new BadRequestException(
        'That material is not in the inspection list. Save the list first, then tag the photo.',
      );
    }

    const photos = (inspection.photos as InspectionPhotoDoc[]).map((p) => {
      const tag = byId.get(p._id.toString());
      if (!tag) return p;
      const lineId = tag.lineId ? new Types.ObjectId(tag.lineId) : null;
      return { ...retag(p), lineId, label: lineId ? '' : (tag.label ?? '') };
    });

    const updated = await this.model
      .findOneAndUpdate(
        { _id: inspection._id, completedAt: null },
        { $set: { photos } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(NOT_EDITABLE);

    await this.record(actor, 'inspection.photos_tagged', po, {
      photos: dto.photos.length,
    });
    return this.toResponse(po, updated);
  }

  async removePhoto(poId: string, photoId: string, actor: Actor) {
    const { po, inspection: found } = await this.load(poId);
    const inspection = this.requireEditable(po, found);

    const photo = (inspection.photos as InspectionPhotoDoc[]).find(
      (p) => p._id.toString() === photoId,
    );
    if (!photo) throw new NotFoundException('Photo not found');

    const updated = await this.model
      .findOneAndUpdate(
        { _id: inspection._id, completedAt: null },
        { $pull: { photos: { _id: photo._id } } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(NOT_EDITABLE);

    await this.files.remove(po.poNumber, 'inspection', photo.storedName);
    await this.record(actor, 'inspection.photo_removed', po, {
      photo: photo.originalName,
    });
    return this.toResponse(po, updated);
  }

  async getPhotoFile(poId: string, photoId: string) {
    const { po, inspection } = await this.load(poId);
    const photo = (
      inspection?.photos as InspectionPhotoDoc[] | undefined
    )?.find((p) => p._id.toString() === photoId);
    if (!photo) throw new NotFoundException('Photo not found');
    return {
      path: this.files.pathFor(po.poNumber, 'inspection', photo.storedName),
      name: photo.originalName,
      mimeType: photo.mimeType,
    };
  }

  /** Remarks stay editable at every stage of the inspection (FR-02.11). */
  async saveRemarks(poId: string, dto: SaveRemarksDto, actor: Actor) {
    const { po, inspection } = await this.load(poId);
    if (!inspection || inspection.type !== InspectionType.Onsite) {
      throw new NotFoundException('This PO has no inspection list.');
    }

    const byId = new Map(
      (inspection.lines as InspectionLineDoc[]).map((l) => [
        l._id.toString(),
        l,
      ]),
    );
    let changed = 0;
    for (const { id, remarks } of dto.lines) {
      const line = byId.get(id);
      if (!line)
        throw new BadRequestException(
          'One or more rows were not found on this inspection.',
        );
      if (line.remarks !== remarks) {
        line.remarks = remarks;
        changed++;
      }
    }
    if (changed > 0) {
      await inspection.save();
      await this.record(actor, 'inspection.remarks_updated', po, {
        lines: changed,
      });
    }
    return this.toResponse(po, inspection);
  }
}
