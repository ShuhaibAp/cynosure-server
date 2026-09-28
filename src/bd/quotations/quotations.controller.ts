import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import {
  streamStoredFile,
  uploadOne,
} from '../../common/files/upload.helpers.js';
import { ClientResponseDto } from './dto/client-response.dto.js';
import { ReturnQuotationDto } from './dto/return-quotation.dto.js';
import { SaveQuotationDto } from './dto/save-quotation.dto.js';
import {
  MAX_SIGNATURE_BYTES,
  MAX_TERMS_FILE_BYTES,
} from './quotation.constants.js';
import { QuotationsService } from './quotations.service.js';

@Controller('purchase-orders/:id/quotation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotationsController {
  constructor(private service: QuotationsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user.role);
  }

  @Post()
  @Roles(Role.BdTeam)
  prepare(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.prepare(id, user);
  }

  // BD edits a draft/returned quotation; Admin can correct a submitted one during review.
  @Put()
  @Roles(Role.BdTeam, Role.Admin)
  save(
    @Param('id') id: string,
    @Body() dto: SaveQuotationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(id, user);
  }

  @Post('approve')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.approve(id, user);
  }

  @Post('return')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  returnForRevision(
    @Param('id') id: string,
    @Body() dto: ReturnQuotationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.returnForRevision(id, dto, user);
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Admin)
  send(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.send(id, user);
  }

  // Module 4: the SoW permission matrix gives both BD and Admin "Process" on Client Response.
  @Post('client-response')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam, Role.Admin)
  recordClientResponse(
    @Param('id') id: string,
    @Body() dto: ClientResponseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recordClientResponse(id, dto, user);
  }

  @Post('revise')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  startRevision(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.startRevision(id, user);
  }

  @Get('download')
  @Roles(Role.BdTeam, Role.Admin)
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.service.download(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(buffer);
  }

  @Post('terms-file')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam, Role.Admin)
  @UseInterceptors(uploadOne('file', MAX_TERMS_FILE_BYTES))
  readTermsFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.readTermsFile(id, file, user);
  }

  @Post('signature')
  @Roles(Role.BdTeam, Role.Admin)
  @UseInterceptors(uploadOne('signature', MAX_SIGNATURE_BYTES))
  setSignature(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.setSignature(id, file, user);
  }

  @Delete('signature')
  @Roles(Role.BdTeam, Role.Admin)
  removeSignature(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeSignature(id, user);
  }

  @Get('signature')
  @Roles(Role.BdTeam, Role.Admin)
  async signature(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getSignatureFile(id));
  }
}
