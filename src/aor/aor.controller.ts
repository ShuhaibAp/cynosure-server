import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles } from '../bd/auth/roles.decorator.js';
import { RolesGuard } from '../bd/auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { AorService } from './aor.service.js';

// Owner: System / Admin. Everyone on the PO can see and download it; Admin records it as sent.
@Controller('purchase-orders/:id/aor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AorController {
  constructor(private service: AorService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user.role);
  }

  @Get('download')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, name } = await this.service.pdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(buffer);
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markSent(id, user);
  }
}
