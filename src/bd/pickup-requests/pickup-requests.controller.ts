import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { SavePickupRequestDto } from './dto/save-pickup-request.dto.js';
import { PickupRequestsService } from './pickup-requests.service.js';

@Controller('purchase-orders/:id/pickup')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PickupRequestsController {
  constructor(private service: PickupRequestsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles(Role.BdTeam)
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.start(id, user);
  }

  @Put()
  @Roles(Role.BdTeam)
  save(
    @Param('id') id: string,
    @Body() dto: SavePickupRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  generate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.generate(id, user);
  }

  @Get('report')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  async report(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.service.getReportFile(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }
}
