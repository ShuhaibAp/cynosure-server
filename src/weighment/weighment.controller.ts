import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles } from '../bd/auth/roles.decorator.js';
import { RolesGuard } from '../bd/auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { WeighmentService } from './weighment.service.js';

class AcknowledgeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @MaxLength(1000, { message: 'Remarks must be 1000 characters or fewer' })
  @IsString()
  remarks?: string;
}

// SoW: the cross-check is automatic ("System"); everyone on the PO can see it, and a failed
// check is explained by Admin or BD.
@Controller('purchase-orders/:id/weighment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WeighmentController {
  constructor(private service: WeighmentService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user.role);
  }

  @Post('acknowledge')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam, Role.Admin)
  acknowledge(
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.acknowledge(id, dto.remarks ?? '', user);
  }
}
