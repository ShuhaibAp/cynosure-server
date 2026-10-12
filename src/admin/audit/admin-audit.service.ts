import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import {
  AuditEvent,
  AuditEventDocument,
} from '../../common/audit/schemas/audit-event.schema.js';
import { ListAuditDto } from './dto/list-audit.dto.js';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Read-only view of the audit trail (Module 11, FR-11.05). Admin only. */
@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AuditEvent.name) private model: Model<AuditEventDocument>,
  ) {}

  async list(query: ListAuditDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const filter: QueryFilter<AuditEventDocument> = {};
    if (query.poNumber)
      filter.poNumber = new RegExp(escapeRegex(query.poNumber), 'i');
    if (query.action)
      filter.action = new RegExp(`^${escapeRegex(query.action)}`, 'i');
    if (query.actor)
      filter.actorName = new RegExp(escapeRegex(query.actor), 'i');
    if (query.role) filter.actorRole = query.role;
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        // "to" is a calendar day: include all of it.
        ...(query.to
          ? { $lt: new Date(new Date(query.to).getTime() + 24 * 3600 * 1000) }
          : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return {
      total,
      page,
      limit,
      items: items.map((e) => ({
        id: e._id.toString(),
        at: e.createdAt,
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        entityType: e.entityType,
        poNumber: e.poNumber ?? null,
        details: e.details ?? null,
      })),
    };
  }
}
