import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UomOptionDocument = HydratedDocument<UomOption>;

// A unit of measure added by the BD team on top of the built-in Uom values.
@Schema({ timestamps: true })
export class UomOption {
  @Prop({ type: String, required: true, trim: true })
  name!: string;

  // Lower-cased name: makes "box" and "Box" the same unit.
  @Prop({ type: String, required: true, unique: true })
  key!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  createdAt!: Date;
}

export const UomOptionSchema = SchemaFactory.createForClass(UomOption);
