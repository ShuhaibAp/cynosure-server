import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { Roles } from '../../bd/auth/roles.decorator.js';
import { RolesGuard } from '../../bd/auth/roles.guard.js';
import { AdminAuditService } from './admin-audit.service.js';
import { ListAuditDto } from './dto/list-audit.dto.js';

// SoW permission matrix: the audit log is "Full" for Admin; other roles' view is still to be defined.
@Controller('admin/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminAuditController {
  constructor(private service: AdminAuditService) {}

  @Get()
  list(@Query() query: ListAuditDto) {
    return this.service.list(query);
  }
}
