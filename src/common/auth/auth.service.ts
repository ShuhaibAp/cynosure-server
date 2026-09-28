import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '../enums/role.enum.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  /**
   * `role` is which of the account's roles to act as for this session - an account can hold
   * more than one (e.g. the same person is both BD Team and Operations Team). Checked only
   * after the password matches, so a wrong role never leaks anything about a valid account to
   * someone who doesn't already know its password.
   */
  async login(email: string, password: string, role: Role) {
    const user = await this.validateUser(email, password);
    if (!user.roles.includes(role)) {
      throw new ForbiddenException(
        "This account isn't registered for that role.",
      );
    }
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role,
        roles: user.roles,
      },
    };
  }
}
