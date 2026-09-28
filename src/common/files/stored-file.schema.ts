import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { Types } from 'mongoose';

@Schema()
export class StoredFile {
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
}

export const StoredFileSchema = SchemaFactory.createForClass(StoredFile);

/** A stored-file subdocument as read back from Mongo (it always carries an `_id`). */
export type StoredFileDoc = StoredFile & { _id: Types.ObjectId };
