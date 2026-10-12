import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Actor, AuditService } from '../common/audit/audit.service.js';
import { PoStatus } from '../common/enums/po-status.enum.js';
import { Role } from '../common/enums/role.enum.js';
import {
  FactoryRecord,
  FactoryRecordDocument,
} from '../factory/schemas/factory-record.schema.js';
import {
  OperationsRecord,
  OperationsRecordDocument,
} from '../operations/schemas/operations-record.schema.js';
import { PurchaseOrderDocument } from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { PurchaseOrdersService } from '../bd/purchase-orders/purchase-orders.service.js';
import {
  TOLERANCE_KG,
  WeighmentCheck,
  WeighmentCheckDocument,
} from './schemas/weighment-check.schema.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const net = (empty: number | null, loaded: number | null) =>
  empty !== null && loaded !== null ? round2(loaded - empty) : null;

// Who may explain a failed check: Admin (who owns report generation) and BD.
const ACKNOWLEDGERS: string[] = [Role.Admin, Role.BdTeam];

@Injectable()
export class WeighmentService {
  constructor(
    @InjectModel(WeighmentCheck.name)
    private model: Model<WeighmentCheckDocument>,
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
      entityType: 'Weighment',
      entityId: po._id.toString(),
      poNumber: po.poNumber,
      details,
    });
  }

  private view(check: WeighmentCheckDocument | null) {
    if (!check) return null;
    return {
      id: check._id.toString(),
      result: check.result,
      toleranceKg: check.toleranceKg,
      differenceKg: check.differenceKg,
      operationsLoadedKg: check.operationsLoadedKg,
      factoryLoadedKg: check.factoryLoadedKg,
      operationsNetKg: check.operationsNetKg,
      factoryNetKg: check.factoryNetKg,
      checkedAt: check.createdAt,
      remarks: check.remarks,
      acknowledgedAt: check.acknowledgedAt,
      acknowledgedBy: check.acknowledgedBy,
      resolved: check.resolvedAt !== null,
      resolvedAt: check.resolvedAt,
    };
  }

  /**
   * Runs the cross-check (FR-08.01..03). Called once when Factory completes: a pass resolves it
   * and sends the PO on to the AOR stage; a fail leaves the PO in Weighment until it is
   * acknowledged with remarks.
   */
  async run(po: PurchaseOrderDocument, actor: Actor) {
    const [ops, factory] = await Promise.all([
      this.operationsModel.findOne({ poId: po._id }).exec(),
      this.factoryModel.findOne({ poId: po._id }).exec(),
    ]);
    const opsLoaded = ops?.weighmentLoadedKg ?? null;
    const facLoaded = factory?.weighmentLoadedKg ?? null;
    const difference =
      opsLoaded !== null && facLoaded !== null
        ? round2(Math.abs(opsLoaded - facLoaded))
        : null;
    // A missing weight can't be shown to be within tolerance.
    const result =
      difference !== null && difference <= TOLERANCE_KG ? 'Pass' : 'Fail';

    let check: WeighmentCheckDocument;
    try {
      check = await this.model.create({
        poId: po._id,
        operationsLoadedKg: opsLoaded,
        factoryLoadedKg: facLoaded,
        operationsNetKg: net(ops?.weighmentEmptyKg ?? null, opsLoaded),
        factoryNetKg: net(factory?.weighmentEmptyKg ?? null, facLoaded),
        differenceKg: difference,
        toleranceKg: TOLERANCE_KG,
        result,
        resolvedAt: result === 'Pass' ? new Date() : null,
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) return;
      throw err;
    }

    await this.record(actor, 'weighment.checked', po, {
      result,
      differenceKg: difference,
      toleranceKg: TOLERANCE_KG,
    });
    if (result === 'Pass') {
      await this.pos.transitionStatus(po._id, PoStatus.Weighment, PoStatus.Aor);
    }
    return check;
  }

  async get(poId: string, role: string) {
    const po = await this.pos.findOrThrow(poId);
    const check = await this.model.findOne({ poId: po._id }).exec();
    return {
      poNumber: po.poNumber,
      poStatus: po.status,
      check: this.view(check),
      canAcknowledge:
        !!check &&
        check.result === 'Fail' &&
        check.resolvedAt === null &&
        ACKNOWLEDGERS.includes(role),
    };
  }

  /** FR-08.04/05: a failed check is cleared only with remarks, which are kept permanently. */
  async acknowledge(poId: string, remarks: string, actor: Actor) {
    const po = await this.pos.findOrThrow(poId);
    const check = await this.model.findOne({ poId: po._id }).exec();
    if (!check)
      throw new NotFoundException('There is no weighment check for this PO.');
    if (check.result !== 'Fail')
      throw new ConflictException(
        'This check passed, so there is nothing to acknowledge.',
      );
    if (check.resolvedAt)
      throw new ConflictException('This check has already been acknowledged.');
    if (!remarks.trim())
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Enter the explanation for the weight difference.',
        errors: { remarks: 'Enter the explanation for the weight difference.' },
      });

    const updated = await this.model
      .findOneAndUpdate(
        { _id: check._id, resolvedAt: null },
        {
          $set: {
            remarks: remarks.trim(),
            acknowledgedAt: new Date(),
            acknowledgedBy: actor.name,
            resolvedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!updated)
      throw new ConflictException('This check has already been acknowledged.');

    const moved = await this.pos.transitionStatus(
      po._id,
      PoStatus.Weighment,
      PoStatus.Aor,
    );
    await this.record(actor, 'weighment.acknowledged', po, {
      remarks: remarks.trim(),
      differenceKg: check.differenceKg,
    });
    return {
      poNumber: po.poNumber,
      poStatus: moved?.status ?? po.status,
      check: this.view(updated),
      canAcknowledge: false,
    };
  }
}
