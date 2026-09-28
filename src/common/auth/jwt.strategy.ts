import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '../enums/role.enum.js';
import { UsersService } from '../users/users.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    // payload.role is the ONE role picked at login for this session - a user can hold several
    // roles, so re-checking it's still one of theirs (not just trusting the token blindly)
    // catches a role being removed from the account after the token was issued.
    if (!user || !user.active || !user.roles.includes(payload.role)) {
      throw new UnauthorizedException();
    }
    return {
      userId: user._id.toString(),
      email: user.email,
      role: payload.role,
      name: user.name,
    };
  }
}
