import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  StoredFile,
  StoredFileSchema,
} from '../../common/files/stored-file.schema.js';

export type OperationsRecordDocument = HydratedDocument<OperationsRecord>;

// Client/Inspected Quantity are snapshotted here at start-time (not re-read live) so this
// record's own numbers stay stable even if, say, a later quotation revision existed - the
// same "snapshot once, edit only what's yours" pattern Quotation used for inspection lines.
@Schema()
export class OperationsLine {
  @Prop({ type: String, required: true, trim: true })
  materialName!: string;

  @Prop({ type: String, required: true })
  uom!: string;

  @Prop({ type: Number, required: true, min: 0 })
  clientQuantity!: number;

  @Prop({ type: Number, required: true, min: 0 })
  inspectedQuantity!: number;

  @Prop({ type: Number, min: 0, default: null })
  actualQuantity!: number | null;

  @Prop({ type: String, default: '' })
  remarks!: string;
}

export const OperationsLineSchema =
  SchemaFactory.createForClass(OperationsLine);
export type OperationsLineDoc = OperationsLine & { _id: Types.ObjectId };

@Schema()
export class ExpenseLine {
  @Prop({ type: String, required: true, trim: true })
  description!: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;
}

export const ExpenseLineSchema = SchemaFactory.createForClass(ExpenseLine);
export type ExpenseLineDoc = ExpenseLine & { _id: Types.ObjectId };

// A photo plus whatever GPS coordinates its EXIF data carried (FR-06.05). Most phone photos
// have this; a screenshot, a stripped/edited image, or a desktop upload simply won't - gpsLat/
// gpsLng stay null rather than failing the upload.
@Schema()
export class GeoPhoto {
  @Prop({ type: String, required: true })
  originalName!: string;

  @Prop({ type: String, required: true })
  storedName!: string;

  @Prop({ type: String, required: true })
  mimeType!: string;

  @Prop({ type: Number, required: true })
  size!: number;

  @Prop({ type: Number, default: null })
  gpsLat!: number | null;

  @Prop({ type: Number, default: null })
  gpsLng!: number | null;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt!: Date;
}

export const GeoPhotoSchema = SchemaFactory.createForClass(GeoPhoto);
export type GeoPhotoDoc = GeoPhoto & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class OperationsRecord {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  // FR-06.01: Operations must acknowledge the Module 5 Inspection Report before proceeding.
  // One-way, like the Module 2 inspection acknowledgement - never un-ticked once set.
  @Prop({ type: Boolean, default: false })
  acknowledged!: boolean;

  @Prop({ type: Date, default: null })
  acknowledgedAt!: Date | null;

  @Prop({ type: String, default: null })
  acknowledgedBy!: string | null;

  // FR-06.04 data fields
  @Prop({ type: Date, default: null })
  pickupDate!: Date | null;

  @Prop({ type: String, default: '' })
  invoiceNumber!: string;

  @Prop({ type: Date, default: null })
  invoiceDate!: Date | null;

  @Prop({ type: Number, min: 0, default: null })
  invoiceAmount!: number | null;

  @Prop({ type: String, default: '' })
  ewayBillNumber!: string;

  @Prop({ type: String, default: '' })
  form6Number!: string;

  // Optional scanned copy (PDF or camera photo) of the Form 6 manifest - the number above is
  // required, the document itself is not (matches the SRS's own literal field list, which only
  // names the number; the scan is an extra the client wanted for audit purposes).
  @Prop({ type: StoredFileSchema, default: null })
  form6Document!: StoredFile | null;

  @Prop({ type: String, default: '' })
  lrNumber!: string;

  @Prop({ type: String, default: '' })
  mplNumber!: string;

  @Prop({ type: String, default: '' })
  vehicleNumber!: string;

  @Prop({ type: String, default: '' })
  weighmentSlipEmptyNumber!: string;

  @Prop({ type: String, default: '' })
  weighmentSlipLoadNumber!: string;

  // The actual gross weight (kg), as distinct from the slip reference numbers above - captured
  // by Operations at pickup (truck weighed empty, then loaded); Factory re-weighs on arrival as
  // its own accuracy check before processing (Module 07), against this figure.
  @Prop({ type: Number, min: 0, default: null })
  weighmentEmptyKg!: number | null;

  @Prop({ type: Number, min: 0, default: null })
  weighmentLoadedKg!: number | null;

  @Prop({ type: String, default: '' })
  padlockSerialNumber!: string;

  @Prop({ type: [OperationsLineSchema], default: [] })
  lines!: OperationsLine[];

  // BR-06.02: these two never merge - kept as separate arrays with separate save endpoints.
  @Prop({ type: [ExpenseLineSchema], default: [] })
  collectionExpenses!: ExpenseLine[];

  @Prop({ type: [ExpenseLineSchema], default: [] })
  logisticsExpenses!: ExpenseLine[];

  @Prop({ type: [GeoPhotoSchema], default: [] })
  photos!: GeoPhoto[];

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: String, default: null })
  completedBy!: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const OperationsRecordSchema =
  SchemaFactory.createForClass(OperationsRecord);
