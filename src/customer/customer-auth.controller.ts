import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CustomerAccessService } from '../common/customers/customer-access.service.js';
import {
  ForgotPasswordDto,
  SetPasswordDto,
  TokenQueryDto,
} from './dto/customer-auth.dto.js';

/** Public endpoints behind the customer app's set-password and forgot-password pages. */
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private access: CustomerAccessService) {}

  @Get('invite')
  invite(@Query() query: TokenQueryDto) {
    return this.access.describeToken(query.token);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  setPassword(@Body() dto: SetPasswordDto) {
    return this.access.setPassword(dto.token, dto.password);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.access.forgotPassword(dto.email);
    return { ok: true };
  }
}
