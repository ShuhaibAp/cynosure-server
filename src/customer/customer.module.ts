import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from '../bd/purchase-orders/schemas/purchase-order.schema.js';
import { AuthModule } from '../common/auth/auth.module.js';
import { CustomersModule } from '../common/customers/customers.module.js';
import {
  Customer,
  CustomerSchema,
} from '../common/customers/schemas/customer.schema.js';
import { OrderRequestsModule } from '../common/order-requests/order-requests.module.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerPortalController } from './customer-portal.controller.js';
import { CustomerPortalService } from './customer-portal.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    AuthModule,
    CustomersModule,
    OrderRequestsModule,
  ],
  controllers: [CustomerAuthController, CustomerPortalController],
  providers: [CustomerPortalService],
})
export class CustomerModule {}
