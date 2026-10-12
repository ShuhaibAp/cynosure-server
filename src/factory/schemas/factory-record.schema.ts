import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  StoredFile,
  StoredFileSchema,
} from '../../common/files/stored-file.schema.js';

export type FactoryRecordDocument = HydratedDocument<FactoryRecord>;

// Snapshotted from the Operations record when Factory starts, so Factory sees the same material
// list (FR-07.01) and enters only what is theirs: the processed quantity and remarks.
@Schema()
export class FactoryLine {
  @Prop({ type: String, required: true, trim: true })
  materialName!: string;

  @Prop({ type: String, required: true })
  uom!: string;

  @Prop({ type: Number, required: true, min: 0 })
  clientQuantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  inspectedQuantity!: number;

  // What Operations counted at collection - shown for comparison, never edited here.
  @Prop({ type: Number, min: 0, default: null })
  actualQuantity!: number | null;

  @Prop({ type: Number, min: 0, default: null })
  processedQuantity!: number | null;

  @Prop({ type: String, default: '' })
  remarks!: string;
}

export const FactoryLineSchema = SchemaFactory.createForClass(FactoryLine);
export type FactoryLineDoc = FactoryLine & { _id: Types.ObjectId };

// One row of the Teardown Log (FR-07.05..07). Only Admin writes it (BR-07.02). The columns are
// the working set from the SRS example - the client has not confirmed the final schema yet.
@Schema()
export class TeardownEntry {
  @Prop({ type: String, required: true, trim: true })
  componentName!: string;

  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  @Prop({ type: String, default: '', trim: true })
  condition!: string;

  @Prop({ type: Date, default: null })
  date!: Date | null;

  @Prop({ type: String, default: '', trim: true })
  technician!: string;

  @Prop({ type: String, default: '' })
  remarks!: string;
}

export const TeardownEntrySchema = SchemaFactory.createForClass(TeardownEntry);
export type TeardownEntryDoc = TeardownEntry & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class FactoryRecord {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  @Prop({ type: [FactoryLineSchema], default: [] })
  lines!: FactoryLine[];

  // Factory's own re-weigh on arrival, read off the two weighment slips below. Module 8 compares
  // this against the weights Operations recorded at pickup.
  @Prop({ type: Number, min: 0, default: null })
  weighmentEmptyKg!: number | null;

  @Prop({ type: Number, min: 0, default: null })
  weighmentLoadedKg!: number | null;

  // What the processing produced: usable recycled output and the non-recyclable residue, both
  // weighed at the Factory. Optional for now (the SRS doesn't name them as fields); the Mass Flow
  // Report accounts for the inbound weight with them.
  @Prop({ type: Number, min: 0, default: null })
  outputWeightKg!: number | null;

  @Prop({ type: Number, min: 0, default: null })
  residueWeightKg!: number | null;

  // BR-07.01: both scans are mandatory before the Factory step can be marked complete.
  @Prop({ type: StoredFileSchema, default: null })
  weighmentSlipEmpty!: StoredFile | null;

  @Prop({ type: StoredFileSchema, default: null })
  weighmentSlipLoad!: StoredFile | null;

  // FR-07.04: an upload facility. Not a completion gate - the SoW says it only becomes one if
  // the client confirms it.
  @Prop({ type: [StoredFileSchema], default: [] })
  photos!: StoredFile[];

  @Prop({ type: [TeardownEntrySchema], default: [] })
  teardownLog!: TeardownEntry[];

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: String, default: null })
  completedBy!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FactoryRecordSchema = SchemaFactory.createForClass(FactoryRecord);
