import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../common/audit/audit.module.js';
import { AuthModule } from '../common/auth/auth.module.js';
import { PurchaseOrdersModule } from '../bd/purchase-orders/purchase-orders.module.js';
import {
  FactoryRecord,
  FactoryRecordSchema,
} from '../factory/schemas/factory-record.schema.js';
import {
  OperationsRecord,
  OperationsRecordSchema,
} from '../operations/schemas/operations-record.schema.js';
import {
  WeighmentCheck,
  WeighmentCheckSchema,
} from './schemas/weighment-check.schema.js';
import { WeighmentController } from './weighment.controller.js';
import { WeighmentService } from './weighment.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WeighmentCheck.name, schema: WeighmentCheckSchema },
      // Read-only: the check compares what Operations and Factory recorded.
      { name: OperationsRecord.name, schema: OperationsRecordSchema },
      { name: FactoryRecord.name, schema: FactoryRecordSchema },
    ]),
    AuthModule,
    AuditModule,
    PurchaseOrdersModule,
  ],
  controllers: [WeighmentController],
  providers: [WeighmentService],
  exports: [WeighmentService],
})
export class WeighmentModule {}
