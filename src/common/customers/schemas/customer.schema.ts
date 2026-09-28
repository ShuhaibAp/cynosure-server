import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: String, required: true, trim: true, index: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true })
  address!: string;

  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
