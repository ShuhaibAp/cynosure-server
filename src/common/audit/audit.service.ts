import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuditEvent,
  AuditEventDocument,
} from './schemas/audit-event.schema.js';

export interface Actor {
  userId: string;
  name: string;
  role: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditEvent.name) private model: Model<AuditEventDocument>,
  ) {}

  /** Never throws: a failed audit write is logged so it can't undo the user's save. */
  async record(event: {
    actor: Actor;
    action: string;
    entityType: string;
    entityId: string;
    poNumber?: string;
    details?: Record<string, unknown>;
  }) {
    try {
      await this.model.create({
        actorId: event.actor.userId,
        actorName: event.actor.name,
        actorRole: event.actor.role,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        poNumber: event.poNumber,
        details: event.details,
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit event "${event.action}" for ${event.poNumber ?? event.entityId}`,
        err as Error,
      );
    }
  }
}
