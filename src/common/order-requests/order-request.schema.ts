import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderRequestDocument = HydratedDocument<OrderRequest>;

export const ORDER_REQUEST_STATUSES = ['New', 'Handled'] as const;
export type OrderRequestStatus = (typeof ORDER_REQUEST_STATUSES)[number];

// "I have an order ready for pickup", sent from the customer app for BD to act on.
@Schema({ timestamps: true })
export class OrderRequest {
  // The customer's most recent customer record when they asked (name/phone/address prefill).
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  customerName!: string;

  @Prop({ type: String, required: true, lowercase: true, index: true })
  customerEmail!: string;

  @Prop({ type: String, default: '' })
  note!: string;

  @Prop({ type: String, enum: ORDER_REQUEST_STATUSES, default: 'New' })
  status!: OrderRequestStatus;

  @Prop({ type: Date, default: null })
  handledAt!: Date | null;

  @Prop({ type: String, default: null })
  handledBy!: string | null;

  // The PO BD created from this request, when they used "Create PO".
  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder', default: null })
  poId!: Types.ObjectId | null;

  createdAt!: Date;
}

export const OrderRequestSchema = SchemaFactory.createForClass(OrderRequest);
OrderRequestSchema.index({ status: 1, createdAt: -1 });
