import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../common/audit/audit.module.js';
import { AuthModule } from '../common/auth/auth.module.js';
import {
  AuditEvent,
  AuditEventSchema,
} from '../common/audit/schemas/audit-event.schema.js';
import { UsersModule } from '../common/users/users.module.js';
import { AdminAuditController } from './audit/admin-audit.controller.js';
import { AdminAuditService } from './audit/admin-audit.service.js';
import { AdminPermissionsController } from './permissions/admin-permissions.controller.js';
import { AdminUsersController } from './users/admin-users.controller.js';
import { AdminUsersService } from './users/admin-users.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditEvent.name, schema: AuditEventSchema },
    ]),
    AuthModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [
    AdminUsersController,
    AdminAuditController,
    AdminPermissionsController,
  ],
  providers: [AdminUsersService, AdminAuditService],
})
export class AdminModule {}
