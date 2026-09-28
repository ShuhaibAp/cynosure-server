import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../../common/enums/role.enum.js';
import { QuotationsService } from './quotations.service.js';

@Controller('quotations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotationsQueueController {
  constructor(private service: QuotationsService) {}

  /** Quotations waiting for Admin's approval. */
  @Get()
  @Roles(Role.Admin)
  pending() {
    return this.service.listPending();
  }
}
