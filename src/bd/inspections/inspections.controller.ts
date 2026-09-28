import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UploadedFiles,
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
  uploadMany,
  uploadOne,
} from '../../common/files/upload.helpers.js';
import { ImportListDto } from './dto/import-list.dto.js';
import { SaveInspectionDto } from './dto/save-inspection.dto.js';
import { SavePhotoTagsDto } from './dto/save-photo-tags.dto.js';
import { SaveRemarksDto } from './dto/save-remarks.dto.js';
import { StartInspectionDto } from './dto/start-inspection.dto.js';
import { MAX_LIST_BYTES } from './inspection.constants.js';
import { InspectionsService } from './inspections.service.js';

@Controller('purchase-orders/:id/inspection')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspectionsController {
  constructor(private service: InspectionsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles(Role.BdTeam)
  start(
    @Param('id') id: string,
    @Body() dto: StartInspectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.start(id, dto, user);
  }

  @Put()
  @Roles(Role.BdTeam)
  save(
    @Param('id') id: string,
    @Body() dto: SaveInspectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.save(id, dto, user);
  }

  // Called once with no mapping fields for a preview + suggested mapping, then again with
  // `confirmed` set once the BD user has approved (or fixed) it in the mapping modal.
  @Post('parse')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  @UseInterceptors(uploadOne('file', MAX_LIST_BYTES))
  parse(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: ImportListDto,
  ) {
    return this.service.importList(id, file, dto);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.complete(id, user);
  }

  @Patch('remarks')
  @Roles(Role.BdTeam)
  saveRemarks(
    @Param('id') id: string,
    @Body() dto: SaveRemarksDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveRemarks(id, dto, user);
  }

  @Post('photos')
  @Roles(Role.BdTeam)
  @UseInterceptors(uploadMany('photos'))
  addPhotos(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addPhotos(id, files ?? [], user);
  }

  @Patch('photos')
  @Roles(Role.BdTeam)
  saveTags(
    @Param('id') id: string,
    @Body() dto: SavePhotoTagsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveTags(id, dto, user);
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
  @Roles(Role.BdTeam)
  removePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.removePhoto(id, photoId, user);
  }
}
