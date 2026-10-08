import { Module } from '@nestjs/common';
import { AuthModule } from '../../common/auth/auth.module.js';
import { OrderRequestsModule as OrderRequestsDataModule } from '../../common/order-requests/order-requests.module.js';
import { OrderRequestsController } from './order-requests.controller.js';

@Module({
  imports: [AuthModule, OrderRequestsDataModule],
  controllers: [OrderRequestsController],
})
export class BdOrderRequestsModule {}
