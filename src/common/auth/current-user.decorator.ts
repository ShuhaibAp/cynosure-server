import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The verified user attached to the request by the JWT strategy. */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
