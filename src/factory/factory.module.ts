import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../common/audit/audit.module.js';
import { AuthModule } from '../common/auth/auth.module.js';
import { FilesModule } from '../common/files/files.module.js';
import { PurchaseOrdersModule } from '../bd/purchase-orders/purchase-orders.module.js';
import {
  OperationsRecord,
  OperationsRecordSchema,
} from '../operations/schemas/operations-record.schema.js';
import { FactoryController } from './factory.controller.js';
import { FactoryService } from './factory.service.js';
import {
  FactoryRecord,
  FactoryRecordSchema,
} from './schemas/factory-record.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FactoryRecord.name, schema: FactoryRecordSchema },
      // Read-only: Factory starts from the material list and weights Operations recorded.
      { name: OperationsRecord.name, schema: OperationsRecordSchema },
    ]),
    AuthModule,
    AuditModule,
    FilesModule,
    PurchaseOrdersModule,
  ],
  controllers: [FactoryController],
  providers: [FactoryService],
})
export class FactoryModule {}
