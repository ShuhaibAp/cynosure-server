import { Module } from '@nestjs/common';
import { CustomersModule } from '../common/customers/customers.module.js';
import { CustomerAuthController } from './customer-auth.controller.js';

@Module({
  imports: [CustomersModule],
  controllers: [CustomerAuthController],
})
export class CustomerModule {}
