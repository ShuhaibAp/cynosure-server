import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ServiceTypeDocument = HydratedDocument<ServiceTypeOption>;

// A PO type added by the BD team on top of the built-in ServiceType values.
@Schema({ timestamps: true })
export class ServiceTypeOption {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  // Lower-cased name: makes "epr" and "EPR" the same type.
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
}

export const ServiceTypeOptionSchema =
  SchemaFactory.createForClass(ServiceTypeOption);
