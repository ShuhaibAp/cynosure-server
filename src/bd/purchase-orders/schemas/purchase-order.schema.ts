import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PoStatus } from '../../../common/enums/po-status.enum.js';
import { ServiceType } from '../../../common/enums/service-type.enum.js';
import {
  StoredFile,
  StoredFileSchema,
} from '../../../common/files/stored-file.schema.js';

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({ timestamps: true })
export class PurchaseOrder {
  @Prop({ type: String, required: true, unique: true })
  poNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: ServiceType })
  serviceType!: ServiceType;

  @Prop({ type: String, default: '' })
  poInstructions!: string;

  @Prop({ type: [StoredFileSchema], default: [] })
  documents!: StoredFile[];

  @Prop({
    type: String,
    required: true,
    enum: PoStatus,
    default: PoStatus.Registration,
    index: true,
  })
  status!: PoStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: String, required: true })
  createdByName!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
PurchaseOrderSchema.index({ createdAt: -1 });
