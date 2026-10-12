import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WeighmentCheckDocument = HydratedDocument<WeighmentCheck>;

export const TOLERANCE_KG = 20;

// Module 8: the automatic cross-check of the gross weight Operations recorded at pickup against
// the load weight Factory read off its own weighment slip. Created once, when Factory completes.
@Schema({ timestamps: true })
export class WeighmentCheck {
  @Prop({
    type: Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    unique: true,
  })
  poId!: Types.ObjectId;

  @Prop({ type: Number, default: null })
  operationsLoadedKg!: number | null;

  @Prop({ type: Number, default: null })
  factoryLoadedKg!: number | null;

  @Prop({ type: Number, default: null })
  operationsNetKg!: number | null;

  @Prop({ type: Number, default: null })
  factoryNetKg!: number | null;

  // Absolute difference between the two loaded weights; null if either was missing.
  @Prop({ type: Number, default: null })
  differenceKg!: number | null;

  @Prop({ type: Number, required: true })
  toleranceKg!: number;

  @Prop({ type: String, enum: ['Pass', 'Fail'], required: true })
  result!: 'Pass' | 'Fail';

  // A failed check stays unresolved until someone acknowledges it with remarks (FR-08.04/05).
  @Prop({ type: String, default: '' })
  remarks!: string;

  @Prop({ type: Date, default: null })
  acknowledgedAt!: Date | null;

  @Prop({ type: String, default: null })
  acknowledgedBy!: string | null;

  // Set at once for a pass, on acknowledgement for a fail.
  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;

  createdAt!: Date;
}

export const WeighmentCheckSchema =
  SchemaFactory.createForClass(WeighmentCheck);
