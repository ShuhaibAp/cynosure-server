import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../../common/auth/auth.module.js';
import { CustomersModule } from '../../common/customers/customers.module.js';
import { FilesModule } from '../../common/files/files.module.js';
import { InspectionsModule } from '../inspections/inspections.module.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';
import { QuotationPdfService } from './quotation-pdf.service.js';
import { TermsReaderService } from './terms-reader.service.js';
import { QuotationsQueueController } from './quotations-queue.controller.js';
import { QuotationsController } from './quotations.controller.js';
import { QuotationsService } from './quotations.service.js';
import { Quotation, QuotationSchema } from './schemas/quotation.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Quotation.name, schema: QuotationSchema },
    ]),
    AuthModule,
    AuditModule,
    CustomersModule,
    FilesModule,
    InspectionsModule,
    PurchaseOrdersModule,
  ],
  controllers: [QuotationsController, QuotationsQueueController],
  providers: [QuotationsService, QuotationPdfService, TermsReaderService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
