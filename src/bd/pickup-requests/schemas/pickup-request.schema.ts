import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PickupStatus } from '../../../common/enums/pickup-status.enum.js';

export type PickupRequestDocument = HydratedDocument<PickupRequest>;

// PO Instructions are NOT duplicated here: FR-05.02/03 pre-populate them from, and write
// edits straight back to, PurchaseOrder.poInstructions - that field is the one source of
// truth so the (future) Factory tab automatically sees the same value with no sync code.
@Schema({ timestamps: true })
export class PickupRequest {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: PickupStatus,
    default: PickupStatus.Draft,
  })
  status!: PickupStatus;

  @Prop({ type: Date, default: null })
  collectionDateTime!: Date | null;

  @Prop({ type: String, default: '' })
  contactName!: string;

  @Prop({ type: String, default: '' })
  contactPhone!: string;

  @Prop({ type: Date, default: null })
  generatedAt!: Date | null;

  @Prop({ type: String, default: null })
  generatedBy!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PickupRequestSchema = SchemaFactory.createForClass(PickupRequest);
