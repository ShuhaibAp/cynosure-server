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
import { AorController } from './aor.controller.js';
import { AorService } from './aor.service.js';
import { AorRecord, AorRecordSchema } from './schemas/aor-record.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AorRecord.name, schema: AorRecordSchema },
      { name: OperationsRecord.name, schema: OperationsRecordSchema },
      { name: FactoryRecord.name, schema: FactoryRecordSchema },
    ]),
    AuthModule,
    AuditModule,
    PurchaseOrdersModule,
  ],
  controllers: [AorController],
  providers: [AorService],
  exports: [AorService],
})
export class AorModule {}
