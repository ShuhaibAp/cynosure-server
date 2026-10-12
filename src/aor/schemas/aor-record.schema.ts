import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AorRecordDocument = HydratedDocument<AorRecord>;

// Module 9: the Acknowledgement of Receipt. Created automatically once both Operations and
// Factory are complete (BR-09.01); the PDF itself is rendered on download from live data.
@Schema({ timestamps: true })
export class AorRecord {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  // The later of the two completion times - the SLA clock starts here (BR-09.02).
  @Prop({ type: Date, required: true })
  anchorAt!: Date;

  // anchorAt + 2 working days (FR-09.04).
  @Prop({ type: Date, required: true })
  dueAt!: Date;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ type: String, default: null })
  sentBy!: string | null;

  createdAt!: Date;
}

export const AorRecordSchema = SchemaFactory.createForClass(AorRecord);
AorRecordSchema.index({ sentAt: 1, dueAt: 1 });
