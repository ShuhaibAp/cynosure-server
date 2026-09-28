import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../../common/auth/auth.module.js';
import { CustomersModule } from '../../common/customers/customers.module.js';
import { FilesModule } from '../../common/files/files.module.js';
import { InspectionsModule } from '../inspections/inspections.module.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';
import { QuotationsModule } from '../quotations/quotations.module.js';
import { PickupReportPdfService } from './pickup-report-pdf.service.js';
import { PickupRequestsController } from './pickup-requests.controller.js';
import { PickupRequestsService } from './pickup-requests.service.js';
import {
  PickupRequest,
  PickupRequestSchema,
} from './schemas/pickup-request.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PickupRequest.name, schema: PickupRequestSchema },
    ]),
    AuthModule,
    AuditModule,
    CustomersModule,
    FilesModule,
    InspectionsModule,
    QuotationsModule,
    PurchaseOrdersModule,
  ],
  controllers: [PickupRequestsController],
  providers: [PickupRequestsService, PickupReportPdfService],
})
export class PickupRequestsModule {}
