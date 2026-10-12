import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Actor, AuditService } from '../common/audit/audit.service.js';
import { addWorkingDays, ReportPdf } from '../common/pdf/report-pdf.js';
import { PoStatus } from '../common/enums/po-status.enum.js';
import { PurchaseOrderDocument } from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../bd/purchase-orders/purchase-orders.service.js';
import {
  FactoryRecord,
  FactoryRecordDocument,
} from '../factory/schemas/factory-record.schema.js';
import {
  OperationsLineDoc,
  OperationsRecord,
  OperationsRecordDocument,
} from '../operations/schemas/operations-record.schema.js';
import { AorData, drawAor } from './aor-pdf.js';
import { AorRecord, AorRecordDocument } from './schemas/aor-record.schema.js';

const SLA_WORKING_DAYS = 2;

@Injectable()
export class AorService {
  constructor(
    @InjectModel(AorRecord.name) private model: Model<AorRecordDocument>,
    @InjectModel(OperationsRecord.name)
    private operationsModel: Model<OperationsRecordDocument>,
    @InjectModel(FactoryRecord.name)
    private factoryModel: Model<FactoryRecordDocument>,
    private pos: PurchaseOrdersService,
    private audit: AuditService,
  ) {}

  private record(
    actor: Actor,
    action: string,
    po: PurchaseOrderDocument,
    details?: Record<string, unknown>,
  ) {
    return this.audit.record({
      actor,
      action,
      entityType: 'AOR',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  /**
   * FR-09.01: only once Operations AND Factory are both complete. Called when Factory completes
   * (Operations is always done by then); the SLA anchor is the later of the two completions.
   */
  async createFor(po: PurchaseOrderDocument, actor: Actor) {
    const [ops, factory] = await Promise.all([
      this.operationsModel.findOne({ poId: po._id }).exec(),
      this.factoryModel.findOne({ poId: po._id }).exec(),
    ]);
    if (!ops?.completedAt || !factory?.completedAt) return null;
    const anchor =
      ops.completedAt > factory.completedAt
        ? ops.completedAt
        : factory.completedAt;
    try {
      const created = await this.model.create({
        poId: po._id,
        anchorAt: anchor,
        dueAt: addWorkingDays(anchor, SLA_WORKING_DAYS),
      });
      await this.record(actor, 'aor.generated', po, {
        dueAt: created.dueAt,
      });
      return created;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return null;
      throw err;
    }
  }

  private view(aor: AorRecordDocument | null) {
    if (!aor) return null;
    const overdue = !aor.sentAt && aor.dueAt.getTime() < Date.now();
    return {
      generatedAt: aor.createdAt,
      anchorAt: aor.anchorAt,
      dueAt: aor.dueAt,
      overdue,
      sentAt: aor.sentAt,
      sentBy: aor.sentBy,
    };
  }

  async get(poId: string, role: string) {
    const po = await this.pos.findOrThrow(poId);
    const aor = await this.model.findOne({ poId: po._id }).exec();
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      aor: this.view(aor),
      canSend: role === 'Admin' && !!aor && !aor.sentAt,
    };
  }

  /** Admin records that the AOR was sent to the client (email delivery isn't part of Phase 1). */
  async markSent(poId: string, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    const aor = await this.model.findOne({ poId: po._id }).exec();
    if (!aor)
      throw new NotFoundException('The AOR has not been generated yet.');
    const updated = await this.model
      .findOneAndUpdate(
        { _id: aor._id, sentAt: null },
        { $set: { sentAt: new Date(), sentBy: actor.name } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException('The AOR has already been marked as sent.');
    await this.record(actor, 'aor.sent', po);
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      aor: this.view(updated),
      canSend: false,
    };
  }

  /** Builds the AOR document (FR-09.02) from the PO, the Operations record and the Factory record. */
  async buildData(po: PurchaseOrderDocument): Promise<AorData | null> {
    const aor = await this.model.findOne({ poId: po._id }).exec();
    if (!aor) return null;
    const ops = await this.operationsModel.findOne({ poId: po._id }).exec();
    const lines = ((ops?.lines ?? []) as OperationsLineDoc[]).map((l) => ({
      materialName: l.materialName,
      uom: l.uom,
      actual: l.actualQuantity,
    }));
    const text = (v: string | number | null | undefined) =>
      v === null || v === undefined || v === '' ? '—' : String(v);
    const references: Array<[string, string]> = [
      ['Invoice number', text(ops?.invoiceNumber)],
      [
        'Invoice date',
        ops?.invoiceDate ? ops.invoiceDate.toISOString().slice(0, 10) : '—',
      ],
      ['E-way bill number', text(ops?.ewayBillNumber)],
      ['Form 6 number', text(ops?.form6Number)],
      ['LR number', text(ops?.lrNumber)],
      ['MPL number', text(ops?.mplNumber)],
      ['Vehicle number', text(ops?.vehicleNumber)],
      ['Weighment slip (empty)', text(ops?.weighmentSlipEmptyNumber)],
      ['Weighment slip (load)', text(ops?.weighmentSlipLoadNumber)],
      ['Padlock serial number', text(ops?.padlockSerialNumber)],
    ];
    const net =
      ops && ops.weighmentEmptyKg !== null && ops.weighmentLoadedKg !== null
        ? Math.round((ops.weighmentLoadedKg - ops.weighmentEmptyKg) * 100) / 100
        : null;
    return {
      poNumber: po.poNumber,
      serviceType: po.serviceType,
      customer: {
        name: po.customerDetails.name,
        address: po.customerDetails.address,
        phone: po.customerDetails.phone,
        email: po.customerDetails.email,
      },
      collectionDate: ops?.pickupDate ?? null,
      generatedAt: aor.createdAt,
      dueAt: aor.dueAt,
      lines,
      references,
      netWeightKg: net,
    };
  }

  async pdf(poId: string, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    if (po.status === PoStatus.Rejected)
      throw new NotFoundException('There is no AOR for this PO.');
    const data = await this.buildData(po);
    if (!data)
      throw new NotFoundException('The AOR has not been generated yet.');
    const pdf = await ReportPdf.create(`AOR ${po.poNumber}`);
    drawAor(pdf, data);
    const buffer = await pdf.finish();
    await this.record(actor, 'aor.downloaded', po);
    return { buffer, name: `AOR-${po.poNumber}.pdf` };
  }
}
