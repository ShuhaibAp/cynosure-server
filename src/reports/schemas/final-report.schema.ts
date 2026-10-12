import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  StoredFile,
  StoredFileSchema,
} from '../../common/files/stored-file.schema.js';

export type FinalReportDocument = HydratedDocument<FinalReport>;

// Module 10: one record per PO. Admin may add the authorised signature for the Certificate of
// Destruction before generating, so the record can exist with `generatedAt` still null. The four
// documents themselves are rendered on demand from the PO's data.
@Schema({ timestamps: true })
export class FinalReport {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  @Prop({ type: StoredFileSchema, default: null })
  signature!: StoredFile | null;

  @Prop({ type: Date, default: null })
  generatedAt!: Date | null;

  @Prop({ type: String, default: null })
  generatedBy!: string | null;

  createdAt!: Date;
}

export const FinalReportSchema = SchemaFactory.createForClass(FinalReport);
