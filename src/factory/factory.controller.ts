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
import { Roles } from '../bd/auth/roles.decorator.js';
import { RolesGuard } from '../bd/auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { MAX_FILE_BYTES } from '../common/files/po-files.service.js';
import {
  streamStoredFile,
  uploadMany,
  uploadOne,
} from '../common/files/upload.helpers.js';
import { SaveFactoryDto, SaveTeardownLogDto } from './dto/save-factory.dto.js';
import { FactoryService } from './factory.service.js';

// Matches the SoW permission matrix's "Factory Data" row: BD / Operations / Admin View,
// Factory Create/Edit. The Teardown Log is Admin Create/Edit (BR-07.02).
@Controller('purchase-orders/:id/factory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FactoryController {
  constructor(private service: FactoryService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.get(id, user.role);
  }

  @Post()
  @Roles(Role.Factory)
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.start(id, user);
  }

  @Put()
  @Roles(Role.Factory)
  save(
    @Param('id') id: string,
    @Body() dto: SaveFactoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }

  @Post('slips/:kind')
  @Roles(Role.Factory)
  @UseInterceptors(uploadOne('slip', MAX_FILE_BYTES))
  uploadSlip(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadSlip(id, kind, file, user);
  }

  @Get('slips/:kind')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  async slip(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getSlipFile(id, kind));
  }

  @Delete('slips/:kind')
  @Roles(Role.Factory)
  removeSlip(
    @Param('id') id: string,
    @Param('kind') kind: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removeSlip(id, kind, user);
  }

  @Post('photos')
  @Roles(Role.Factory)
  @UseInterceptors(uploadMany('photos'))
  uploadPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.uploadPhotos(id, files ?? [], user);
  }

  @Get('photos/:photoId')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations, Role.Factory)
  async photo(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getPhotoFile(id, photoId));
  }

  @Delete('photos/:photoId')
  @Roles(Role.Factory)
  removePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removePhoto(id, photoId, user);
  }

  @Put('teardown-log')
  @Roles(Role.Admin)
  saveTeardownLog(
    @Param('id') id: string,
    @Body() dto: SaveTeardownLogDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveTeardownLog(id, dto, user);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.Factory)
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.complete(id, user);
  }
}
