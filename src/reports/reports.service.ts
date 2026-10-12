import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { readFile } from 'node:fs/promises';
import { Model } from 'mongoose';
import { Actor, AuditService } from '../common/audit/audit.service.js';
import { PoStatus } from '../common/enums/po-status.enum.js';
import { PoFilesService } from '../common/files/po-files.service.js';
import { ReportPdf } from '../common/pdf/report-pdf.js';
import { AorService } from '../aor/aor.service.js';
import { drawAor } from '../aor/aor-pdf.js';
import {
  Inspection,
  InspectionDocument,
} from '../bd/inspections/schemas/inspection.schema.js';
import { PurchaseOrderDocument } from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../bd/purchase-orders/purchase-orders.service.js';
import {
  FactoryLineDoc,
  FactoryRecord,
  FactoryRecordDocument,
} from '../factory/schemas/factory-record.schema.js';
import {
  OperationsRecord,
  OperationsRecordDocument,
} from '../operations/schemas/operations-record.schema.js';
import {
  WeighmentCheck,
  WeighmentCheckDocument,
} from '../weighment/schemas/weighment-check.schema.js';
import {
  drawCod,
  drawMassFlow,
  drawSustainability,
  ReportData,
} from './report-docs.js';
import {
  FinalReport,
  FinalReportDocument,
} from './schemas/final-report.schema.js';

export const REPORT_KINDS = [
  'cod',
  'sustainability',
  'mass-flow',
  'full-set',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

const TITLES: Record<ReportKind, string> = {
  cod: 'Certificate of Destruction',
  sustainability: 'Sustainability Report',
  'mass-flow': 'Mass Flow Report',
  'full-set': 'Full Set',
};

const NOT_GENERATED = 'The final reports have not been generated yet.';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(FinalReport.name)
    private model: Model<FinalReportDocument>,
    @InjectModel(OperationsRecord.name)
    private operationsModel: Model<OperationsRecordDocument>,
    @InjectModel(FactoryRecord.name)
    private factoryModel: Model<FactoryRecordDocument>,
    @InjectModel(WeighmentCheck.name)
    private checkModel: Model<WeighmentCheckDocument>,
    @InjectModel(Inspection.name)
    private inspectionModel: Model<InspectionDocument>,
    private pos: PurchaseOrdersService,
    private aor: AorService,
    private files: PoFilesService,
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
      entityType: 'FinalReports',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  /** FR-10.07: what still stands between this PO and Admin generating the reports. */
  private async blockers(po: PurchaseOrderDocument): Promise<string[]> {
    const [ops, factory, check] = await Promise.all([
      this.operationsModel.findOne({ poId: po._id }).exec(),
      this.factoryModel.findOne({ poId: po._id }).exec(),
      this.checkModel.findOne({ poId: po._id }).exec(),
    ]);
    const out: string[] = [];
    if (!ops?.completedAt) out.push('Operations data entry is not complete.');
    if (!factory?.completedAt) out.push('Factory data entry is not complete.');
    if (factory?.completedAt) {
      if (!check) out.push('The weighment cross-check has not run.');
      else if (!check.resolvedAt)
        out.push(
          'The weighment cross-check failed and must be acknowledged with remarks.',
        );
    }
    return out;
  }

  async state(poId: string, role: string) {
    const po = await this.pos.findOrThrow(poId);
    const report = await this.model.findOne({ poId: po._id }).exec();
    const blockers = report?.generatedAt ? [] : await this.blockers(po);
    const generated = !!report?.generatedAt;
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      generated,
      generatedAt: report?.generatedAt ?? null,
      generatedBy: report?.generatedBy ?? null,
      blockers,
      canGenerate:
        role === 'Admin' &&
        !generated &&
        blockers.length === 0 &&
        po.status === PoStatus.Aor,
      canEditSignature: role === 'Admin',
      signature: report?.signature
        ? {
            name: report.signature.originalName,
            size: report.signature.size,
          }
        : null,
      documents: generated
        ? REPORT_KINDS.map((kind) => ({ kind, title: TITLES[kind] }))
        : [],
    };
  }

  async generate(poId: string, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    const existing = await this.model.findOne({ poId: po._id }).exec();
    if (existing?.generatedAt)
      throw new ConflictException('The final reports were already generated.');
    const blockers = await this.blockers(po);
    if (blockers.length > 0 || po.status !== PoStatus.Aor) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'The final reports cannot be generated yet.',
        blockers: blockers.length > 0 ? blockers : ['The PO is not ready.'],
      });
    }

    const updated = await this.model
      .findOneAndUpdate(
        { poId: po._id, generatedAt: null },
        { $set: { generatedAt: new Date(), generatedBy: actor.name } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException('The final reports were already generated.');

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Aor,
      PoStatus.FinalReports,
    );
    if (!moved) {
      await this.model.updateOne(
        { _id: updated._id },
        { $set: { generatedAt: null, generatedBy: null } },
      );
      throw new ConflictException('This PO is no longer in the AOR stage.');
    }
    await this.record(actor, 'final_reports.generated', moved);
    return this.state(poId, actor.role);
  }

  async setSignature(
    poId: string,
    file: Express.Multer.File | undefined,
    actor: Actor,
  ) {
    if (!file)
      throw new BadRequestException('Choose a signature image to upload.');
    const po = await this.pos.findOrThrow(poId);
    const [prepared] = this.files.prepare([file], 'photo');
    const [saved] = await this.files.save(po.poNumber, 'reports', [prepared]);
    const previous = (await this.model.findOne({ poId: po._id }).exec())
      ?.signature;
    await this.model
      .findOneAndUpdate(
        { poId: po._id },
        { $set: { signature: saved } },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    if (previous)
      await this.files.remove(po.poNumber, 'reports', previous.storedName);
    await this.record(actor, 'final_reports.signature_added', po);
    return this.state(poId, actor.role);
  }

  async removeSignature(poId: string, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    const report = await this.model.findOne({ poId: po._id }).exec();
    if (!report?.signature)
      throw new NotFoundException('There is no signature to remove.');
    await this.model
      .updateOne({ _id: report._id }, { $set: { signature: null } })
      .exec();
    await this.files.remove(
      po.poNumber,
      'reports',
      report.signature.storedName,
    );
    await this.record(actor, 'final_reports.signature_removed', po);
    return this.state(poId, actor.role);
  }

  async getSignatureFile(poId: string) {
    const po = await this.pos.findOrThrow(poId);
    const report = await this.model.findOne({ poId: po._id }).exec();
    if (!report?.signature)
      throw new NotFoundException('There is no signature.');
    return {
      path: this.files.pathFor(
        po.poNumber,
        'reports',
        report.signature.storedName,
      ),
      name: report.signature.originalName,
      mimeType: report.signature.mimeType,
    };
  }

  private async buildData(
    po: PurchaseOrderDocument,
    report: FinalReportDocument,
  ): Promise<ReportData> {
    const [ops, factory, check, inspection] = await Promise.all([
      this.operationsModel.findOne({ poId: po._id }).exec(),
      this.factoryModel.findOne({ poId: po._id }).exec(),
      this.checkModel.findOne({ poId: po._id }).exec(),
      this.inspectionModel.findOne({ poId: po._id }).exec(),
    ]);
    const signature = report.signature
      ? await readFile(
          this.files.pathFor(
            po.poNumber,
            'reports',
            report.signature.storedName,
          ),
        ).catch(() => null)
      : null;
    const net = (e: number | null | undefined, l: number | null | undefined) =>
      e !== null && e !== undefined && l !== null && l !== undefined
        ? Math.round((l - e) * 100) / 100
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
      generatedAt: report.generatedAt ?? new Date(),
      destructionDate: factory?.completedAt ?? null,
      lines: ((factory?.lines ?? []) as FactoryLineDoc[]).map((l) => ({
        materialName: l.materialName,
        uom: l.uom,
        inspected: l.inspectedQuantity,
        actual: l.actualQuantity,
        processed: l.processedQuantity,
        remarks: l.remarks,
      })),
      signature,
      weights: {
        operationsNetKg: net(ops?.weighmentEmptyKg, ops?.weighmentLoadedKg),
        factoryNetKg: net(
          factory?.weighmentEmptyKg,
          factory?.weighmentLoadedKg,
        ),
        outputKg: factory?.outputWeightKg ?? null,
        residueKg: factory?.residueWeightKg ?? null,
      },
      check: check
        ? {
            result: check.result,
            differenceKg: check.differenceKg,
            toleranceKg: check.toleranceKg,
            remarks: check.remarks,
          }
        : null,
      inspectionExpense: inspection?.expenseTotal ?? null,
      collectionExpenses: (ops?.collectionExpenses ?? []).map((e) => ({
        description: e.description,
        amount: e.amount,
      })),
      logisticsExpenses: (ops?.logisticsExpenses ?? []).map((e) => ({
        description: e.description,
        amount: e.amount,
      })),
    };
  }

  /** Renders one of the four documents (FR-10.01/02). Only after Admin has generated them. */
  async pdf(poId: string, kind: string, actor: Actor) {
    if (!(REPORT_KINDS as readonly string[]).includes(kind))
      throw new NotFoundException('Unknown document');
    const which = kind as ReportKind;
    const po = await this.pos.findOrThrow(poId);
    const report = await this.model.findOne({ poId: po._id }).exec();
    if (!report?.generatedAt) throw new NotFoundException(NOT_GENERATED);

    const data = await this.buildData(po, report);
    const pdf = await ReportPdf.create(`${TITLES[which]} ${po.poNumber}`);
    if (which === 'cod' || which === 'full-set') drawCod(pdf, data);
    if (which === 'sustainability' || which === 'full-set')
      drawSustainability(pdf, data);
    if (which === 'mass-flow' || which === 'full-set') drawMassFlow(pdf, data);
    if (which === 'full-set') {
      // The Full Set bundles the AOR with the three reports (composition is still to be
      // confirmed with the client).
      const aorData = await this.aor.buildData(po);
      if (aorData) drawAor(pdf, aorData);
    }
    const buffer = await pdf.finish();
    await this.record(actor, 'final_reports.downloaded', po, {
      document: TITLES[which],
    });
    return {
      buffer,
      name: `${TITLES[which].replace(/ /g, '-')}-${po.poNumber}.pdf`,
    };
  }
}
