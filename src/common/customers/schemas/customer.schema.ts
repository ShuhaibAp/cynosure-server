import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: String, required: true, trim: true, index: true })
  name!: string;

  @Prop({ type: String, required: true, trim: true })
  address!: string;

  @Prop({ type: String, trim: true, default: '' })
  location?: string;

  @Prop({ type: String, required: true, trim: true })
  phone!: string;

  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  // Customer-app login (the User with the Customer role); null until they set a password.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  userId!: Types.ObjectId | null;

  // SHA-256 of the emailed set-password token - the token itself is never stored.
  @Prop({ type: String, default: null, index: true })
  inviteTokenHash!: string | null;

  @Prop({ type: Date, default: null })
  inviteExpiresAt!: Date | null;

  @Prop({ type: Date, default: null })
  invitedAt!: Date | null;

  @Prop({ type: Date, default: null })
  activatedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
