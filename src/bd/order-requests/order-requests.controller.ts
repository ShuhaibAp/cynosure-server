import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { OrderRequestsService } from '../../common/order-requests/order-requests.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';

// The customer app's "I have an order ready" requests, as seen by BD.
@Controller('order-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderRequestsController {
  constructor(private service: OrderRequestsService) {}

  @Get()
  @Roles(Role.BdTeam, Role.Admin)
  list(@Query('status') status?: string) {
    return this.service.list(
      status === 'New' || status === 'Handled' ? status : undefined,
    );
  }

  // Declared before ':id' so "count" is not read as an id.
  @Get('count')
  @Roles(Role.BdTeam, Role.Admin)
  async count() {
    return { new: await this.service.countNew() };
  }

  @Get(':id')
  @Roles(Role.BdTeam, Role.Admin)
  getOne(@Param('id') id: string) {
    return this.service.findOpen(id);
  }

  @Post(':id/handled')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.BdTeam)
  handled(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.markHandled(id, user.name);
  }
}
