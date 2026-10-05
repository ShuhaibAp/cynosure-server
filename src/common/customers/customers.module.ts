import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { Customer, CustomerSchema } from './schemas/customer.schema.js';
import { CustomerAccessService } from './customer-access.service.js';
import { CustomersService } from './customers.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
    ]),
    UsersModule,
    MailModule,
  ],
  providers: [CustomersService, CustomerAccessService],
  exports: [CustomersService, CustomerAccessService],
})
export class CustomersModule {}
