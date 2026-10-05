import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InspectionType } from '../../../common/enums/inspection.enum.js';
export type InspectionDocument = HydratedDocument<Inspection>;

/**
 * An inspection photo plus its tag, so the team can say what each image shows: either one of
 * the listed materials (`lineId`) or a free-text name for a bundled/general shot (`label`).
 * Untagged photos have both empty.
 */
@Schema()
export class InspectionPhoto {
  @Prop({ type: String, required: true })
  originalName!: string;

  @Prop({ type: String, required: true })
  storedName!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  size!: number;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt!: Date;

  /** The inspection line this photo shows; null when tagged by hand or not at all. */
  @Prop({ type: Types.ObjectId, default: null })
  lineId!: Types.ObjectId | null;

  @Prop({ type: String, default: '', trim: true })
  label!: string;
}

export const InspectionPhotoSchema =
  SchemaFactory.createForClass(InspectionPhoto);
export type InspectionPhotoDoc = InspectionPhoto & { _id: Types.ObjectId };

@Schema()
export class InspectionLine {
  @Prop({ type: String, required: true, trim: true })
  materialName!: string;

  // A built-in Uom or a unit added through POST /uoms.
  @Prop({ type: String, required: true })
  uom!: string;

  @Prop({ type: Number, required: true, min: 0 })
  clientQuantity!: number;

  @Prop({ type: Number, min: 0, default: null })
  inspectedQuantity!: number | null;

  @Prop({ type: String, default: '' })
  remarks!: string;
}

export const InspectionLineSchema =
  SchemaFactory.createForClass(InspectionLine);

/** An inspection line as read back from Mongo (it always carries an `_id`). */
export type InspectionLineDoc = InspectionLine & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class Inspection {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: InspectionType })
  type!: InspectionType;

  @Prop({ type: [InspectionLineSchema], default: [] })
  lines!: InspectionLine[];

  /** "I acknowledge that the inspection process is complete": unlocks Inspected Quantity. */
  @Prop({ type: Boolean, default: false })
  acknowledged!: boolean;

  @Prop({ type: Date, default: null })
  acknowledgedAt!: Date | null;

  @Prop({ type: String, default: null })
  acknowledgedBy!: string | null;

  /** Inspection expense as a single ₹ total (structure still TBC with the client). */
  @Prop({ type: Number, min: 0, default: null })
  expenseTotal!: number | null;

  @Prop({ type: [InspectionPhotoSchema], default: [] })
  photos!: InspectionPhoto[];

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InspectionSchema = SchemaFactory.createForClass(Inspection);
