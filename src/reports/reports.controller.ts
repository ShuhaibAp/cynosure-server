import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles } from '../bd/auth/roles.decorator.js';
import { RolesGuard } from '../bd/auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { streamStoredFile, uploadOne } from '../common/files/upload.helpers.js';
import { ReportsService } from './reports.service.js';

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

// SoW matrix "Final Reports": BD / Operations / Factory View, Admin Generate.
@Controller('purchase-orders/:id/final-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  state(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.state(id, user.role);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  generate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.generate(id, user);
  }

  @Post('signature')
  @Roles(Role.Admin)
  @UseInterceptors(uploadOne('signature', MAX_SIGNATURE_BYTES))
  setSignature(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setSignature(id, file, user);
  }

  @Delete('signature')
  @Roles(Role.Admin)
  removeSignature(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeSignature(id, user);
  }

  @Get('signature')
  @Roles(Role.Admin)
  async signature(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getSignatureFile(id));
  }

  @Get('documents/:kind')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  async document(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, name } = await this.service.pdf(id, kind, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(buffer);
  }
}
