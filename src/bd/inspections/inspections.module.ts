import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../../common/auth/auth.module.js';
import { FilesModule } from '../../common/files/files.module.js';
import { UomsModule } from '../uoms/uoms.module.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';
import { InspectionsController } from './inspections.controller.js';
import { InspectionsService } from './inspections.service.js';
import { Inspection, InspectionSchema } from './schemas/inspection.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Inspection.name, schema: InspectionSchema },
    ]),
    AuthModule,
    AuditModule,
    FilesModule,
    PurchaseOrdersModule,
    UomsModule,
  ],
  controllers: [InspectionsController],
  providers: [InspectionsService],
  exports: [InspectionsService],
})
export class InspectionsModule {}
