import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
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
} from '../../common/files/upload.helpers.js';
import { AddServiceTypeDto } from './dto/add-service-type.dto.js';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { ListPurchaseOrdersDto } from './dto/list-purchase-orders.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PurchaseOrdersService } from './purchase-orders.service.js';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PurchaseOrdersController {
  constructor(private service: PurchaseOrdersService) {}

  @Post()
  @Roles(Role.BdTeam)
  @UseInterceptors(uploadMany('documents'))
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.create(dto, files ?? [], user);
  }

  @Get()
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  list(@Query() query: ListPurchaseOrdersDto) {
    return this.service.list(query);
  }

  // Declared before ':id' so "summary" is not read as an id.
  @Get('summary')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  summary() {
    return this.service.summary();
  }

  @Get('service-types')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  serviceTypes() {
    return this.service.listServiceTypes();
  }

  @Post('service-types')
  @Roles(Role.BdTeam)
  addServiceType(
    @Body() dto: AddServiceTypeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.addServiceType(dto.name, user);
  }

  @Get(':id/customer-access')
  @Roles(Role.BdTeam, Role.Admin)
  customerAccess(@Param('id') id: string) {
    return this.service.customerAccessStatus(id);
  }

  @Post(':id/customer-access')
  @Roles(Role.BdTeam, Role.Admin)
  inviteCustomer(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.inviteCustomer(id, user);
  }

  @Get(':id')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @Roles(Role.BdTeam)
  @UseInterceptors(uploadMany('documents'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, files ?? [], user);
  }

  @Get(':id/documents/:docId')
  @Roles(Role.BdTeam, Role.Admin, Role.Operations)
  async download(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return streamStoredFile(res, await this.service.getDocumentFile(id, docId));
  }
}
