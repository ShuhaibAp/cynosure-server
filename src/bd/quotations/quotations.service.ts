import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { readFile } from 'node:fs/promises';
import { Model, Types } from 'mongoose';
import { Actor, AuditService } from '../../common/audit/audit.service.js';
import { ClientDecision } from '../../common/enums/client-decision.enum.js';
import { InspectionType } from '../../common/enums/inspection.enum.js';
import { PoStatus } from '../../common/enums/po-status.enum.js';
import { QuotationStatus } from '../../common/enums/quotation.enum.js';
import { Role } from '../../common/enums/role.enum.js';
import { CustomersService } from '../../common/customers/customers.service.js';
import { PoFilesService } from '../../common/files/po-files.service.js';
import { InspectionsService } from '../inspections/inspections.service.js';
import { InspectionLineDoc } from '../inspections/schemas/inspection.schema.js';
import { PurchaseOrderDocument } from '../purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { ClientResponseDto } from './dto/client-response.dto.js';
import { ReturnQuotationDto } from './dto/return-quotation.dto.js';
import { SaveQuotationDto } from './dto/save-quotation.dto.js';
import { gstAmount, lineTotal, MAX_TOTAL, sumTotals } from './money.js';
import { MAX_TERMS } from './quotation.constants.js';
import { QuotationPdfService } from './quotation-pdf.service.js';
import { TermsReaderService } from './terms-reader.service.js';
import {
  Quotation,
  QuotationDocument,
  QuotationLineDoc,
} from './schemas/quotation.schema.js';

const BD_EDITABLE = [QuotationStatus.Draft, QuotationStatus.Returned];
const NOT_EDITABLE = 'This quotation cannot be edited at its current stage.';
const CHANGED_ELSEWHERE =
  'This quotation was changed elsewhere. Reload the page and try again.';

/** BD works on a draft or returned quotation; Admin can correct a submitted one while reviewing it. */
function editableStatuses(role: string): QuotationStatus[] {
  if (role === Role.BdTeam) return BD_EDITABLE;
  if (role === Role.Admin) return [QuotationStatus.Submitted];
  return [];
}

@Injectable()
export class QuotationsService {
  constructor(
    @InjectModel(Quotation.name) private model: Model<QuotationDocument>,
    private pos: PurchaseOrdersService,
    private customers: CustomersService,
    private inspections: InspectionsService,
    private files: PoFilesService,
    private pdf: QuotationPdfService,
    private termsReader: TermsReaderService,
    private audit: AuditService,
  ) {}

  private async load(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const quotation = await this.model
      .findOne({ poId: po._id })
      .sort({ version: -1 })
      .exec();
    return { po, quotation };
  }

  private isEditable(
    po: PurchaseOrderDocument,
    q: QuotationDocument,
    role: string,
  ) {
    return (
      editableStatuses(role).includes(q.status) &&
      po.status === PoStatus.Quotation
    );
  }

  private requireEditable(
    po: PurchaseOrderDocument,
    q: QuotationDocument | null,
    role: string,
  ): QuotationDocument {
    if (!q)
      throw new NotFoundException('No quotation has been started for this PO.');
    if (!this.isEditable(po, q, role))
      throw new ConflictException(NOT_EDITABLE);
    return q;
  }

  /** What still stands between this quotation and Admin approval. */
  private blockers(q: QuotationDocument): string[] {
    const out: string[] = [];
    if (q.lines.length === 0)
      out.push('Add at least one item to the quotation.');
    else if (q.lines.some((l) => l.unitPrice === null)) {
      out.push('Enter a unit price for every item.');
    }
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
      entityType: 'Quotation',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  /** Every version of this PO's quotation, oldest first (FR-04.07 / AC-04.04). */
  private async versionsFor(po: PurchaseOrderDocument, currentVersion: number) {
    const docs = await this.model
      .find({ poId: po._id })
      .sort({ version: 1 })
      .exec();
    return docs.map((v) => ({
      version: v.version,
      current: v.version === currentVersion,
      status: v.status,
      grandTotal: v.grandTotal,
      submittedAt: v.submittedAt,
      reviewedAt: v.reviewedAt,
      sentAt: v.sentAt,
      clientDecision: v.clientDecision,
      clientDecisionAt: v.clientDecisionAt,
    }));
  }

  /** `editable` is from the viewer's side: BD and Admin can edit at different stages. */
  private async toResponse(
    po: PurchaseOrderDocument,
    q: QuotationDocument | null,
    role: string,
  ) {
    if (!q) {
      const canPrepare = po.status === PoStatus.Quotation;
      const inspection = canPrepare
        ? await this.inspections.findCompleted(po._id)
        : null;
      return {
        poNumber: po.poNumber,
        poStatus: po.status,
        canPrepare,
        inspectionType: inspection?.type ?? null,
        quotation: null,
      };
    }

    const editable = this.isEditable(po, q, role);
    const versions = await this.versionsFor(po, q.version);
    const canRecordClientResponse =
      po.status === PoStatus.ClientResponse && !!q.sentAt && !q.clientDecision;
    const canStartRevision =
      po.status === PoStatus.Quotation &&
      q.clientDecision === ClientDecision.RevisionRequired;
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      canPrepare: false,
      inspectionType: null,
      quotation: {
        id: q._id.toString(),
        version: q.version,
        status: q.status,
        editable,
        manualLines: q.manualLines,
        lines: (q.lines as QuotationLineDoc[]).map((l) => ({
          id: l._id.toString(),
          materialName: l.materialName,
          uom: l.uom,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
        terms: q.terms,
        signature: q.signature
          ? {
              name: q.signature.originalName,
              size: q.signature.size,
              uploadedAt: q.signature.uploadedAt,
            }
          : null,
        subtotal: q.subtotal ?? q.grandTotal,
        gstPercent: q.gstPercent,
        gstAmount: q.gstAmount,
        grandTotal: q.grandTotal,
        adminEditedAt: q.adminEditedAt,
        adminEditedBy: q.adminEditedBy,
        submittedAt: q.submittedAt,
        submittedBy: q.submittedBy,
        reviewedAt: q.reviewedAt,
        reviewedBy: q.reviewedBy,
        returnNote: q.returnNote,
        sentAt: q.sentAt,
        sentBy: q.sentBy,
        canDownload: q.status === QuotationStatus.Approved,
        blockers: editable ? this.blockers(q) : [],
        clientDecision: q.clientDecision,
        clientDecisionAt: q.clientDecisionAt,
        clientDecisionBy: q.clientDecisionBy,
        clientDecisionNote: q.clientDecisionNote,
        canRecordClientResponse,
        canStartRevision,
        versions,
      },
    };
  }

  async get(poId: string, role: string) {
    const { po, quotation } = await this.load(poId);
    return this.toResponse(po, quotation, role);
  }

  /** Starts v1: rows are copied from the finished inspection, or left empty for a virtual one. */
  async prepare(poId: string, actor: Actor) {
    const { po, quotation } = await this.load(poId);
    if (quotation)
      throw new ConflictException(
        'A quotation has already been started for this PO.',
      );
    if (po.status !== PoStatus.Quotation) {
      throw new ConflictException(
        'A quotation can be prepared once the inspection is complete.',
      );
    }
    const inspection = await this.inspections.findCompleted(po._id);
    if (!inspection)
      throw new ConflictException(
        'The inspection for this PO is not complete.',
      );

    const manual = inspection.type === InspectionType.Virtual;
    const lines = manual
      ? []
      : (inspection.lines as InspectionLineDoc[]).map((l) => ({
          _id: new Types.ObjectId(),
          inspectionLineId: l._id,
          materialName: l.materialName,
          uom: l.uom,
          quantity: l.inspectedQuantity ?? 0,
          unitPrice: null,
          lineTotal: null,
        }));

    let created: QuotationDocument;
    try {
      created = await this.model.create({
        poId: po._id,
        version: 1,
        status: QuotationStatus.Draft,
        lines,
        manualLines: manual,
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'A quotation has already been started for this PO.',
        );
      }
      throw err;
    }

    await this.record(actor, 'quotation.created', po, {
      version: 1,
      source: manual ? 'manual' : 'inspection',
      lines: lines.length,
    });
    return this.toResponse(po, created, actor.role);
  }

  async save(poId: string, dto: SaveQuotationDto, actor: Actor) {
    const { po, quotation: found } = await this.load(poId);
    const q = this.requireEditable(po, found, actor.role);
    const errors: Record<string, string> = {};

    const existing = new Map(
      (q.lines as QuotationLineDoc[]).map((l) => [l._id.toString(), l]),
    );
    let rows: Array<{
      _id: Types.ObjectId;
      inspectionLineId: Types.ObjectId | null;
      materialName: string;
      uom: QuotationLineDoc['uom'];
      quantity: number;
      unitPrice: number | null;
    }>;

    if (q.manualLines) {
      const used = new Set<string>();
      rows = dto.lines.map((line, i) => {
        if (!line.materialName)
          errors[`lines.${i}.materialName`] = 'Material name is required';
        if (!line.uom) errors[`lines.${i}.uom`] = 'Select a unit';
        if (line.quantity === undefined || line.quantity === null) {
          errors[`lines.${i}.quantity`] = 'Quantity is required';
        }
        const prior =
          line.id && !used.has(line.id) ? existing.get(line.id) : undefined;
        if (prior) used.add(line.id!);
        return {
          _id: prior?._id ?? new Types.ObjectId(),
          inspectionLineId: null,
          materialName: line.materialName ?? '',
          uom: line.uom!,
          quantity: line.quantity ?? 0,
          unitPrice: line.unitPrice ?? null,
        };
      });
    } else {
      // Rows come from the inspection: only unit prices can change.
      const prices = new Map<string, number | null>();
      dto.lines.forEach((line, i) => {
        if (!line.id || !existing.has(line.id))
          errors[`lines.${i}.id`] = 'Unknown row';
        else prices.set(line.id, line.unitPrice ?? null);
      });
      rows = (q.lines as QuotationLineDoc[]).map((l) => ({
        _id: l._id,
        inspectionLineId: l.inspectionLineId,
        materialName: l.materialName,
        uom: l.uom,
        quantity: l.quantity,
        unitPrice: prices.has(l._id.toString())
          ? prices.get(l._id.toString())!
          : l.unitPrice,
      }));
    }

    const lines = rows.map((row, i) => {
      const total =
        row.unitPrice === null ? null : lineTotal(row.quantity, row.unitPrice);
      if (total !== null && total > MAX_TOTAL)
        errors[`lines.${i}.unitPrice`] = 'This amount is too large';
      return { ...row, lineTotal: total };
    });
    const subtotal = sumTotals(lines.map((l) => l.lineTotal));
    const gstPercent =
      dto.gstPercent === undefined ? q.gstPercent : dto.gstPercent;
    const gst = gstPercent === null ? 0 : gstAmount(subtotal, gstPercent);
    const grandTotal = sumTotals([subtotal, gst]);
    if (grandTotal > MAX_TOTAL) errors.lines = 'The grand total is too large';

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: Object.values(errors),
        errors,
      });
    }

    const byAdmin = actor.role === Role.Admin;
    const updated = await this.model
      .findOneAndUpdate(
        {
          _id: q._id,
          status: { $in: editableStatuses(actor.role) },
          updatedAt: q.updatedAt,
        },
        {
          $set: {
            lines,
            terms: dto.terms ?? q.terms,
            subtotal,
            gstPercent,
            gstAmount: gst,
            grandTotal,
            ...(byAdmin
              ? { adminEditedAt: new Date(), adminEditedBy: actor.name }
              : {}),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(
      actor,
      byAdmin ? 'quotation.edited_by_admin' : 'quotation.updated',
      po,
      { version: q.version, lines: lines.length, gstPercent, grandTotal },
    );
    return this.toResponse(po, updated, actor.role);
  }

  /**
   * Reads the text out of an uploaded PDF/Word/text file for the Terms box. Nothing is stored -
   * the client puts the text into the (editable, autosaved) terms field. Cut to the terms limit,
   * with `truncated` so the user is told rather than silently losing the end.
   */
  async readTermsFile(
    poId: string,
    file: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    const { po, quotation } = await this.load(poId);
    this.requireEditable(po, quotation, actor.role);

    const { text, fileName } = await this.termsReader.read(file);
    const truncated = text.length > MAX_TERMS;
    await this.record(actor, 'quotation.terms_file_read', po, {
      fileName,
      characters: text.length,
      truncated,
    });
    return { text: text.slice(0, MAX_TERMS), truncated, fileName };
  }

  async setSignature(
    poId: string,
    file: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    if (!file)
      throw new BadRequestException('Choose a signature image to upload.');
    const { po, quotation: found } = await this.load(poId);
    const q = this.requireEditable(po, found, actor.role);

    const [prepared] = this.files.prepare([file], 'photo');
    const [saved] = await this.files.save(po.poNumber, 'quotation', [prepared]);
    const previous = q.signature;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: q._id, status: { $in: editableStatuses(actor.role) } },
        { $set: { signature: saved } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) {
      await this.files.remove(po.poNumber, 'quotation', saved.storedName);
      throw new ConflictException(NOT_EDITABLE);
    }
    if (previous)
      await this.files.remove(po.poNumber, 'quotation', previous.storedName);

    await this.record(actor, 'quotation.signature_added', po, {
      version: q.version,
    });
    return this.toResponse(po, updated, actor.role);
  }

  async removeSignature(poId: string, actor: Actor) {
    const { po, quotation: found } = await this.load(poId);
    const q = this.requireEditable(po, found, actor.role);
    if (!q.signature)
      throw new NotFoundException('There is no signature to remove.');

    const previous = q.signature;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: q._id, status: { $in: editableStatuses(actor.role) } },
        { $set: { signature: null } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(NOT_EDITABLE);

    await this.files.remove(po.poNumber, 'quotation', previous.storedName);
    await this.record(actor, 'quotation.signature_removed', po, {
      version: q.version,
    });
    return this.toResponse(po, updated, actor.role);
  }

  async getSignatureFile(poId: string) {
    const { po, quotation } = await this.load(poId);
    if (!quotation?.signature)
      throw new NotFoundException('There is no signature on this quotation.');
    const { storedName, originalName, mimeType } = quotation.signature;
    return {
      path: this.files.pathFor(po.poNumber, 'quotation', storedName),
      name: originalName,
      mimeType,
    };
  }

  /** BD hands the quotation to Admin; from here BD can no longer change it (FR-03.06). */
  async submit(poId: string, actor: Actor) {
    const { po, quotation: found } = await this.load(poId);
    const q = this.requireEditable(po, found, Role.BdTeam);

    const blockers = this.blockers(q);
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'The quotation is not ready to be submitted.',
        blockers,
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: q._id, status: { $in: BD_EDITABLE }, updatedAt: q.updatedAt },
        {
          $set: {
            status: QuotationStatus.Submitted,
            submittedAt: new Date(),
            submittedBy: actor.name,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    await this.record(actor, 'quotation.submitted', po, {
      version: q.version,
      grandTotal: q.grandTotal,
    });
    return this.toResponse(po, updated, actor.role);
  }

  private async decide(
    poId: string,
    to: QuotationStatus.Approved | QuotationStatus.Returned,
    note: string,
    actor: Actor,
  ) {
    const { po, quotation } = await this.load(poId);
    if (!quotation)
      throw new NotFoundException('No quotation has been started for this PO.');
    if (quotation.status !== QuotationStatus.Submitted) {
      throw new ConflictException(
        'Only a submitted quotation can be reviewed.',
      );
    }
    // Admin can edit a submitted quotation, so it may no longer meet what Submit checked.
    const blockers =
      to === QuotationStatus.Approved ? this.blockers(quotation) : [];
    if (blockers.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'The quotation is not ready to be approved.',
        blockers,
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: quotation._id, status: QuotationStatus.Submitted },
        {
          $set: {
            status: to,
            reviewedAt: new Date(),
            reviewedBy: actor.name,
            returnNote: note,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException('This quotation has already been reviewed.');

    await this.record(
      actor,
      to === QuotationStatus.Approved
        ? 'quotation.approved'
        : 'quotation.returned',
      po,
      { version: quotation.version, ...(note ? { note } : {}) },
    );
    return this.toResponse(po, updated, actor.role);
  }

  approve(poId: string, actor: Actor) {
    return this.decide(poId, QuotationStatus.Approved, '', actor);
  }

  returnForRevision(poId: string, dto: ReturnQuotationDto, actor: Actor) {
    return this.decide(poId, QuotationStatus.Returned, dto.note ?? '', actor);
  }

  /** Records that Admin has sent the approved quotation to the client and opens the Client Response stage. */
  async send(poId: string, actor: Actor) {
    const { po, quotation } = await this.load(poId);
    if (!quotation)
      throw new NotFoundException('No quotation has been started for this PO.');
    if (quotation.status !== QuotationStatus.Approved || quotation.sentAt) {
      throw new ConflictException(
        'Only an approved quotation that has not been sent yet can be sent.',
      );
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: quotation._id, status: QuotationStatus.Approved, sentAt: null },
        { $set: { sentAt: new Date(), sentBy: actor.name } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException('This quotation has already been sent.');

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Quotation,
      PoStatus.ClientResponse,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: quotation._id },
        { $set: { sentAt: null, sentBy: null } },
      );
      throw new ConflictException(
        'This PO is no longer in the Quotation stage.',
      );
    }

    await this.record(actor, 'quotation.sent', moved, {
      version: quotation.version,
    });
    return this.toResponse(moved, updated, actor.role);
  }

  /**
   * Module 4: records the client's decision on the version that was sent, then moves the PO
   * on - Approved advances to Pickup (Module 5, FR-04.08), Rejected closes the PO (FR-04.02/03),
   * Revision Required sends it back to Quotation Preparation for a new version (FR-04.04).
   */
  async recordClientResponse(
    poId: string,
    dto: ClientResponseDto,
    actor: Actor,
  ) {
    const { po, quotation } = await this.load(poId);
    if (!quotation)
      throw new NotFoundException('No quotation has been started for this PO.');
    if (po.status !== PoStatus.ClientResponse || !quotation.sentAt) {
      throw new ConflictException(
        'This PO is not waiting for a client response.',
      );
    }
    if (quotation.clientDecision) {
      throw new ConflictException(
        'This quotation has already received a client response.',
      );
    }
    const note = dto.note?.trim() ?? '';
    if (dto.decision === ClientDecision.Rejected && !note) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Enter the reason the client rejected this quotation.',
        errors: {
          note: 'Enter the reason the client rejected this quotation.',
        },
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: quotation._id, clientDecision: null },
        {
          $set: {
            clientDecision: dto.decision,
            clientDecisionAt: new Date(),
            clientDecisionBy: actor.name,
            clientDecisionNote: note,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated) throw new ConflictException(CHANGED_ELSEWHERE);

    const nextStatus =
      dto.decision === ClientDecision.Approved
        ? PoStatus.Pickup
        : dto.decision === ClientDecision.Rejected
          ? PoStatus.Rejected
          : PoStatus.Quotation;
    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.ClientResponse,
      nextStatus,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: quotation._id },
        {
          $set: {
            clientDecision: null,
            clientDecisionAt: null,
            clientDecisionBy: null,
            clientDecisionNote: '',
          },
        },
      );
      throw new ConflictException(
        'This PO is no longer waiting for a client response.',
      );
    }

    await this.record(
      actor,
      dto.decision === ClientDecision.Approved
        ? 'quotation.client_approved'
        : dto.decision === ClientDecision.Rejected
          ? 'quotation.client_rejected'
          : 'quotation.client_revision_requested',
      moved,
      { version: quotation.version, ...(note ? { note } : {}) },
    );
    return this.toResponse(moved, updated, actor.role);
  }

  /** BD starts v2+ after the client asked for a revision; prior pricing is copied in and editable (FR-04.05). */
  async startRevision(poId: string, actor: Actor) {
    const { po, quotation } = await this.load(poId);
    if (po.status !== PoStatus.Quotation)
      throw new ConflictException(
        'A revision can be started once the PO is back in the Quotation stage.',
      );
    if (
      !quotation ||
      quotation.clientDecision !== ClientDecision.RevisionRequired
    ) {
      throw new ConflictException(
        'A quotation has already been started for this PO.',
      );
    }

    const lines = (quotation.lines as QuotationLineDoc[]).map((l) => ({
      _id: new Types.ObjectId(),
      inspectionLineId: l.inspectionLineId,
      materialName: l.materialName,
      uom: l.uom,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    }));

    let created: QuotationDocument;
    try {
      created = await this.model.create({
        poId: po._id,
        version: quotation.version + 1,
        status: QuotationStatus.Draft,
        lines,
        manualLines: quotation.manualLines,
        terms: quotation.terms,
        subtotal: quotation.subtotal ?? quotation.grandTotal,
        gstPercent: quotation.gstPercent,
        gstAmount: quotation.gstAmount,
        grandTotal: quotation.grandTotal,
        createdBy: new Types.ObjectId(actor.userId),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException(
          'A quotation has already been started for this PO.',
        );
      }
      throw err;
    }

    await this.record(actor, 'quotation.revision_started', po, {
      version: created.version,
      previousVersion: quotation.version,
    });
    return this.toResponse(po, created, actor.role);
  }

  /** The PDF is only ever produced for an approved quotation: the download gate has no bypass (BR-03.01). */
  async download(poId: string, actor: Actor) {
    const { po, quotation } = await this.load(poId);
    if (!quotation)
      throw new NotFoundException('No quotation has been started for this PO.');
    if (quotation.status !== QuotationStatus.Approved) {
      throw new ForbiddenException(
        'The quotation can be downloaded only after Admin approval.',
      );
    }
    const customer = await this.customers.findById(po.customerId);
    if (!customer) throw new NotFoundException('Customer record not found');

    const signature = quotation.signature
      ? await readFile(
          this.files.pathFor(
            po.poNumber,
            'quotation',
            quotation.signature.storedName,
          ),
        ).catch(() => null)
      : null;

    const buffer = await this.pdf.build({
      poNumber: po.poNumber,
      serviceType: po.serviceType,
      version: quotation.version,
      approvedAt: quotation.reviewedAt,
      customer: {
        name: customer.name,
        address: customer.address,
        phone: customer.phone,
        email: customer.email,
      },
      lines: (quotation.lines as QuotationLineDoc[]).map((l) => ({
        materialName: l.materialName,
        uom: l.uom,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      subtotal: quotation.subtotal ?? quotation.grandTotal,
      gstPercent: quotation.gstPercent,
      gstAmount: quotation.gstAmount,
      grandTotal: quotation.grandTotal,
      terms: quotation.terms,
      signature,
    });

    await this.record(actor, 'quotation.downloaded', po, {
      version: quotation.version,
    });
    return {
      buffer,
      filename: `Quotation-${po.poNumber}-v${quotation.version}.pdf`,
    };
  }

  /**
   * Module 5: the material list for the Inspection Report is sourced from the current
   * quotation's lines rather than re-deriving it from the Module 2 inspection, because the
   * quotation's `quantity` already IS the inspected quantity for Onsite POs (copied in
   * read-only at prepare-time) and is the only material record that exists at all for
   * Virtual ones (BD types it directly there). Empty if no quotation exists yet.
   */
  async latestLines(poId: Types.ObjectId) {
    const q = await this.model.findOne({ poId }).sort({ version: -1 }).exec();
    return q ? (q.lines as QuotationLineDoc[]) : [];
  }

  /** The Admin approval queue: quotations waiting for a decision, oldest first. */
  async listPending() {
    const filter = { status: QuotationStatus.Submitted };
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ submittedAt: 1 }).limit(200).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    const pos = await this.pos.findByIds(items.map((q) => q.poId));
    const customers = await this.customers.findByIds(
      pos.map((p) => p.customerId),
    );
    const poById = new Map(pos.map((p) => [p._id.toString(), p]));
    const customerById = new Map(customers.map((c) => [c._id.toString(), c]));

    return {
      total,
      items: items.map((q) => {
        const po = poById.get(q.poId.toString());
        return {
          poId: q.poId.toString(),
          poNumber: po?.poNumber ?? '—',
          customerName: po
            ? (customerById.get(po.customerId.toString())?.name ?? '—')
            : '—',
          version: q.version,
          grandTotal: q.grandTotal,
          submittedAt: q.submittedAt,
          submittedBy: q.submittedBy,
        };
      }),
    };
  }
}
