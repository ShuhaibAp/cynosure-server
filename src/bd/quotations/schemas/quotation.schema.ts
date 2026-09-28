import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ClientDecision } from '../../../common/enums/client-decision.enum.js';
import { Uom } from '../../../common/enums/inspection.enum.js';
import { QuotationStatus } from '../../../common/enums/quotation.enum.js';
import {
  StoredFile,
  StoredFileSchema,
} from '../../../common/files/stored-file.schema.js';

export type QuotationDocument = HydratedDocument<Quotation>;

@Schema()
export class QuotationLine {
  /** The inspection line this row was copied from (null for hand-typed rows on virtual inspections). */
  @Prop({ type: Types.ObjectId, default: null })
  inspectionLineId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, trim: true })
  materialName!: string;

  @Prop({ type: String, required: true, enum: Uom })
  uom!: Uom;

  @Prop({ type: Number, required: true, min: 0 })
  quantity!: number;

  @Prop({ type: Number, min: 0, default: null })
  unitPrice!: number | null;

  @Prop({ type: Number, min: 0, default: null })
  lineTotal!: number | null;
}

export const QuotationLineSchema = SchemaFactory.createForClass(QuotationLine);

/** A quotation line as read back from Mongo (it always carries an `_id`). */
export type QuotationLineDoc = QuotationLine & { _id: Types.ObjectId };

@Schema({ timestamps: true })
export class Quotation {
  @Prop({ type: Types.ObjectId, ref: 'PurchaseOrder', required: true })
  poId!: Types.ObjectId;

  /** v1 today; Module 4's revisions add v2, v3… without overwriting earlier versions. */
  @Prop({ type: Number, required: true, default: 1 })
  version!: number;

  @Prop({
    type: String,
    required: true,
    enum: QuotationStatus,
    default: QuotationStatus.Draft,
  })
  status!: QuotationStatus;

  @Prop({ type: [QuotationLineSchema], default: [] })
  lines!: QuotationLine[];

  /** True when BD types the rows (virtual inspection); false when they come from the inspection. */
  @Prop({ type: Boolean, default: false })
  manualLines!: boolean;

  @Prop({ type: String, default: '' })
  terms!: string;

  @Prop({ type: StoredFileSchema, default: null })
  signature!: StoredFile | null;

  /** Sum of the line totals, before GST. Null on quotations saved before GST existed (read it as grandTotal). */
  @Prop({ type: Number, min: 0, default: null })
  subtotal!: number | null;

  /** Optional GST rate typed by BD/Admin; null means no GST line on the quotation. */
  @Prop({ type: Number, min: 0, max: 100, default: null })
  gstPercent!: number | null;

  @Prop({ type: Number, min: 0, default: 0 })
  gstAmount!: number;

  /** Subtotal + GST. */
  @Prop({ type: Number, min: 0, default: 0 })
  grandTotal!: number;

  /** Set when Admin edits a submitted quotation during review, so BD can see it was changed. */
  @Prop({ type: Date, default: null })
  adminEditedAt!: Date | null;

  @Prop({ type: String, default: null })
  adminEditedBy!: string | null;

  @Prop({ type: Date, default: null })
  submittedAt!: Date | null;

  @Prop({ type: String, default: null })
  submittedBy!: string | null;

  /** Admin's decision (approve or return) and, for returns, the note for BD. */
  @Prop({ type: Date, default: null })
  reviewedAt!: Date | null;

  @Prop({ type: String, default: null })
  reviewedBy!: string | null;

  @Prop({ type: String, default: '' })
  returnNote!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ type: String, default: null })
  sentBy!: string | null;

  /** Module 4: the client's decision on this (sent) version, recorded by BD or Admin. */
  @Prop({ type: String, enum: ClientDecision, default: null })
  clientDecision!: ClientDecision | null;

  @Prop({ type: Date, default: null })
  clientDecisionAt!: Date | null;

  @Prop({ type: String, default: null })
  clientDecisionBy!: string | null;

  /** Mandatory reason for a rejection; optional feedback for a revision request. */
  @Prop({ type: String, default: '' })
  clientDecisionNote!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const QuotationSchema = SchemaFactory.createForClass(Quotation);
QuotationSchema.index({ poId: 1, version: 1 }, { unique: true });
QuotationSchema.index({ status: 1, submittedAt: 1 });
