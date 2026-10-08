import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './common/users/users.module.js';
import { AuthModule } from './common/auth/auth.module.js';
import { InspectionsModule } from './bd/inspections/inspections.module.js';
import { QuotationsModule } from './bd/quotations/quotations.module.js';
import { PickupRequestsModule } from './bd/pickup-requests/pickup-requests.module.js';
import { BdOrderRequestsModule } from './bd/order-requests/order-requests.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { PurchaseOrdersModule } from './bd/purchase-orders/purchase-orders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    UsersModule,
    AuthModule,
    PurchaseOrdersModule,
    InspectionsModule,
    QuotationsModule,
    PickupRequestsModule,
    OperationsModule,
    CustomerModule,
    BdOrderRequestsModule,
  ],
})
export class AppModule {}
