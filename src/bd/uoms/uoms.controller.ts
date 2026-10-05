import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { AddUomDto } from './dto/add-uom.dto.js';
import { UomsService } from './uoms.service.js';

@Controller('uoms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UomsController {
  constructor(private service: UomsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  list() {
    return this.service.list();
  }

  @Post()
  // Admin edits quotation lines while reviewing, so can add a unit too.
  @Roles(Role.BdTeam, Role.Admin)
  add(@Body() dto: AddUomDto, @CurrentUser() user: AuthUser) {
    return this.service.add(dto.name, user.userId);
  }
}
