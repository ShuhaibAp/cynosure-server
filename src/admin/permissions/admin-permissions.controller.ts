import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { Roles } from '../../bd/auth/roles.decorator.js';
import { RolesGuard } from '../../bd/auth/roles.guard.js';
import { MATRIX_ROLES, PERMISSION_ROWS } from './permission-matrix.js';

@Controller('admin/permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminPermissionsController {
  @Get()
  matrix() {
    return { roles: MATRIX_ROLES, rows: PERMISSION_ROWS };
  }
}
