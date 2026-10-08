import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrderRequest, OrderRequestSchema } from './order-request.schema.js';
import { OrderRequestsService } from './order-requests.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrderRequest.name, schema: OrderRequestSchema },
    ]),
  ],
  providers: [OrderRequestsService],
  exports: [OrderRequestsService],
})
export class OrderRequestsModule {}
