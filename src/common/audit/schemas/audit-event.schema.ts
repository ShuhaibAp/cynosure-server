import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditEvent {
  @Prop({ type: String, required: true })
  actorId!: string;

  @Prop({ type: String, required: true })
  actorName!: string;

  @Prop({ type: String, required: true })
  actorRole!: string;

  @Prop({ type: String, required: true, index: true })
  action!: string;

  @Prop({ type: String, required: true })
  entityType!: string;

  @Prop({ type: String, required: true, index: true })
  entityId!: string;

  @Prop({ type: String, index: true })
  poNumber?: string;

  @Prop({ type: Object })
  details?: Record<string, unknown>;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
