import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthUser } from '../common/auth/current-user.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { Roles } from '../bd/auth/roles.decorator.js';
import { RolesGuard } from '../bd/auth/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import { CustomerPortalService } from './customer-portal.service.js';
import { CreateOrderRequestDto } from './dto/create-order-request.dto.js';

// Everything here is scoped to the signed-in customer's own email - never an id from the URL.
@Controller('customer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Customer)
export class CustomerPortalController {
  constructor(private service: CustomerPortalService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.service.me(user.email);
  }

  @Get('orders')
  orders(@CurrentUser() user: AuthUser) {
    return this.service.orders(user.email);
  }

  @Get('orders/:id')
  order(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.order(user.email, id);
  }

  @Get('order-requests')
  requests(@CurrentUser() user: AuthUser) {
    return this.service.requestsFor(user.email);
  }

  @Post('order-requests')
  createRequest(
    @Body() dto: CreateOrderRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createRequest(user.email, dto.note ?? '');
  }
}
