import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AuthModule } from '../../common/auth/auth.module.js';
import { CustomersModule } from '../../common/customers/customers.module.js';
import { FilesModule } from '../../common/files/files.module.js';
import {
  PickupRequest,
  PickupRequestSchema,
} from '../pickup-requests/schemas/pickup-request.schema.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { Counter, CounterSchema } from './schemas/counter.schema.js';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Counter.name, schema: CounterSchema },
      // Read-only access to the scheduled collection date for the PO List's countdown badge
      // (FR-06.03) - importing PickupRequestsModule would be circular, since it already
      // imports PurchaseOrdersModule.
      { name: PickupRequest.name, schema: PickupRequestSchema },
    ]),
    AuthModule,
    CustomersModule,
    AuditModule,
    FilesModule,
  ],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
