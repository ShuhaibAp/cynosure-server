import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AorModule } from '../aor/aor.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { AuthModule } from '../common/auth/auth.module.js';
import { FilesModule } from '../common/files/files.module.js';
import {
  Inspection,
  InspectionSchema,
} from '../bd/inspections/schemas/inspection.schema.js';
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
} from '../weighment/schemas/weighment-check.schema.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import {
  FinalReport,
  FinalReportSchema,
} from './schemas/final-report.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FinalReport.name, schema: FinalReportSchema },
      // Read-only sources for the documents.
      { name: OperationsRecord.name, schema: OperationsRecordSchema },
      { name: FactoryRecord.name, schema: FactoryRecordSchema },
      { name: WeighmentCheck.name, schema: WeighmentCheckSchema },
      { name: Inspection.name, schema: InspectionSchema },
    ]),
    AuthModule,
    AuditModule,
    FilesModule,
    PurchaseOrdersModule,
    AorModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
