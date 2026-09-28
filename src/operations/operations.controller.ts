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
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles } from './auth/roles.decorator.js';
import { RolesGuard } from './auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { MAX_FILE_BYTES } from '../common/files/po-files.service.js';
import {
  streamStoredFile,
  uploadMany,
  uploadOne,
} from '../common/files/upload.helpers.js';
import { SaveExpensesDto } from './dto/save-expenses.dto.js';
import { SaveOperationsDto } from './dto/save-operations.dto.js';
import { OperationsService } from './operations.service.js';

// Matches the SoW permission matrix's "Operations Data" row: BD/Admin View, Operations Create/Edit.
@Controller('purchase-orders/:id/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationsController {
  constructor(private service: OperationsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles(Role.Operations)
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.start(id, user);
  }

  @Put()
  @Roles(Role.Operations)
  save(
    @Param('id') id: string,
    @Body() dto: SaveOperationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }

  @Put('collection-expenses')
  @Roles(Role.Operations)
  saveCollectionExpenses(
    @Param('id') id: string,
    @Body() dto: SaveExpensesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveCollectionExpenses(id, dto, user);
  }

  @Put('logistics-expenses')
  @Roles(Role.Operations)
  saveLogisticsExpenses(
    @Param('id') id: string,
    @Body() dto: SaveExpensesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveLogisticsExpenses(id, dto, user);
  }

  @Post('photos')
  @Roles(Role.Operations)
  @UseInterceptors(uploadMany('photos'))
  uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadPhotos(id, files ?? [], user);
  }

  @Get('photos/:photoId')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  async photo(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getPhotoFile(id, photoId));
  }

  @Delete('photos/:photoId')
  @Roles(Role.Operations)
  removePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removePhoto(id, photoId, user);
  }

  @Post('form6-document')
  @Roles(Role.Operations)
  @UseInterceptors(uploadOne('form6', MAX_FILE_BYTES))
  uploadForm6Document(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadForm6Document(id, file, user);
  }

  @Get('form6-document')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  async form6Document(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getForm6DocumentFile(id));
  }

  @Delete('form6-document')
  @Roles(Role.Operations)
  removeForm6Document(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeForm6Document(id, user);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Operations)
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.complete(id, user);
  }
}
