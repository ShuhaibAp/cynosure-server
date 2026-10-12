import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Actor, AuditService } from '../../common/audit/audit.service.js';
import { Role } from '../../common/enums/role.enum.js';
import { UserDocument } from '../../common/users/schemas/user.schema.js';
import { UsersService } from '../../common/users/users.service.js';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
} from './dto/admin-users.dto.js';

const view = (u: UserDocument) => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  roles: u.roles,
  active: u.active,
  isCustomer: u.roles.includes(Role.Customer),
});

/** User and role management (Module 11, FR-11.01). Admin only. */
@Injectable()
export class AdminUsersService {
  constructor(
    private users: UsersService,
    private audit: AuditService,
  ) {}

  private record(
    actor: Actor,
    action: string,
    user: UserDocument,
    details?: Record<string, unknown>,
  ) {
    return this.audit.record({
      actor,
      action,
      entityType: 'User',
      entityId: user._id.toString(),
      details: { email: user.email, ...details },
    });
  }

  async list() {
    return (await this.users.list()).map(view);
  }

  private async find(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, actor: Actor) {
    if (await this.users.findByEmail(dto.email))
      throw new ConflictException('An account with this email already exists.');
    const user = await this.users.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash: await bcrypt.hash(dto.password, 10),
      roles: dto.roles,
    });
    await this.record(actor, 'user.created', user, { roles: dto.roles });
    return view(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: Actor) {
    const user = await this.find(id);
    const self = id === actor.userId;

    if (user.roles.includes(Role.Customer) && dto.roles)
      throw new BadRequestException(
        "A customer's roles are managed through the customer app invite.",
      );

    // Nobody can lock the system by removing the last Admin, or lock themselves out.
    const losesAdmin =
      user.roles.includes(Role.Admin) &&
      ((dto.roles && !dto.roles.includes(Role.Admin)) || dto.active === false);
    if (self && (dto.active === false || (dto.roles && losesAdmin)))
      throw new BadRequestException(
        "You can't deactivate your own account or remove your own Admin role.",
      );
    if (
      losesAdmin &&
      user.active &&
      (await this.users.countActiveAdmins(id)) === 0
    )
      throw new BadRequestException('There must be at least one active Admin.');

    const changes: { name?: string; roles?: Role[]; active?: boolean } = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.roles !== undefined) changes.roles = dto.roles;
    if (dto.active !== undefined) changes.active = dto.active;
    const updated = (await this.users.update(id, changes)) ?? user;

    await this.record(
      actor,
      dto.active === false && user.active
        ? 'user.deactivated'
        : dto.active === true && !user.active
          ? 'user.reactivated'
          : 'user.updated',
      updated,
      {
        ...(dto.name !== undefined && dto.name !== user.name
          ? { name: { from: user.name, to: dto.name } }
          : {}),
        ...(dto.roles ? { roles: { from: user.roles, to: dto.roles } } : {}),
      },
    );
    return view(updated);
  }

  async resetPassword(id: string, dto: ResetPasswordDto, actor: Actor) {
    const user = await this.find(id);
    await this.users.setPasswordHash(id, await bcrypt.hash(dto.password, 10));
    await this.record(actor, 'user.password_reset', user);
    return { ok: true };
  }
}
