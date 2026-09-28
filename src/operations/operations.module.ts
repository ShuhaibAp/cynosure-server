import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../common/audit/audit.module.js';
import { AuthModule } from '../common/auth/auth.module.js';
import { FilesModule } from '../common/files/files.module.js';
import { InspectionsModule } from '../bd/inspections/inspections.module.js';
import { PurchaseOrdersModule } from '../bd/purchase-orders/purchase-orders.module.js';
import { QuotationsModule } from '../bd/quotations/quotations.module.js';
import { OperationsController } from './operations.controller.js';
import { OperationsService } from './operations.service.js';
import {
  OperationsRecord,
  OperationsRecordSchema,
} from './schemas/operations-record.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationsRecord.name, schema: OperationsRecordSchema },
    ]),
    AuthModule,
    AuditModule,
    FilesModule,
    InspectionsModule,
    QuotationsModule,
    PurchaseOrdersModule,
  ],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
