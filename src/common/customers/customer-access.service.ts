import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { Role } from '../enums/role.enum.js';
import { MailService } from '../mail/mail.service.js';
import { UsersService } from '../users/users.service.js';
import { Customer, CustomerDocument } from './schemas/customer.schema.js';

const INVITE_DAYS = 7;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export type CustomerAccessStatus = 'none' | 'invited' | 'active';

export interface InviteResult {
  status: CustomerAccessStatus;
  emailed: boolean;
  /** Only present when the email could not be sent, so staff can pass the link on themselves. */
  link?: string;
  reason?: string;
}

/**
 * Customer-app access: a customer is invited when the client approves a quotation, sets a
 * password from the emailed link, and from then on logs in through /auth/login as "Customer".
 */
@Injectable()
export class CustomerAccessService {
  private readonly log = new Logger(CustomerAccessService.name);

  constructor(
    @InjectModel(Customer.name) private model: Model<CustomerDocument>,
    private users: UsersService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private appUrl() {
    return (
      this.config.get<string>('CUSTOMER_APP_URL') ?? 'http://localhost:4101'
    ).replace(/\/$/, '');
  }

  private statusOf(
    customer: Pick<CustomerDocument, 'activatedAt' | 'inviteTokenHash'>,
  ): CustomerAccessStatus {
    if (customer.activatedAt) return 'active';
    return customer.inviteTokenHash ? 'invited' : 'none';
  }

  async status(customerId: string) {
    const customer = await this.model.findById(customerId).exec();
    if (!customer) throw new NotFoundException('Customer record not found');
    return { status: this.statusOf(customer) };
  }

  /**
   * Gives the customer access: nothing to do if they already have it, otherwise a fresh
   * set-password link is emailed. Used when the client approves, and by "Resend invite".
   */
  async invite(customerId: string): Promise<InviteResult> {
    const customer = await this.model.findById(customerId).exec();
    if (!customer) throw new NotFoundException('Customer record not found');

    // The same person may appear on several customer records (one per PO), so a login that
    // already exists for this email counts as access.
    const existing = await this.users.findByEmail(customer.email);
    if (existing?.roles.includes(Role.Customer)) {
      await this.model.updateMany(
        { email: customer.email, activatedAt: null },
        { $set: { userId: existing._id, activatedAt: new Date() } },
      );
      return { status: 'active', emailed: false };
    }
    if (existing) {
      return {
        status: 'none',
        emailed: false,
        reason:
          'This email belongs to a staff account, so it cannot also be a customer login. Change the customer email first.',
      };
    }
    return this.issue(customer, 'invite');
  }

  /** "Forgot password": always answers the same way so it can't be used to find accounts. */
  async forgotPassword(email: string) {
    const customer = await this.model
      .findOne({
        email: email.toLowerCase().trim(),
        activatedAt: { $ne: null },
      })
      .exec();
    if (customer) await this.issue(customer, 'reset');
  }

  private async issue(
    customer: CustomerDocument,
    kind: 'invite' | 'reset',
  ): Promise<InviteResult> {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000);
    await this.model.updateOne(
      { _id: customer._id },
      {
        $set: {
          inviteTokenHash: hashToken(token),
          inviteExpiresAt: expires,
          ...(kind === 'invite' ? { invitedAt: new Date() } : {}),
        },
      },
    );
    const link = `${this.appUrl()}/set-password?token=${token}`;
    const first = kind === 'invite';
    const intro = first
      ? 'Your quotation has been approved. Create a password to follow your order in the Cynosure customer app.'
      : 'We received a request to reset your Cynosure password.';
    const expiry = `This link is valid for ${INVITE_DAYS} days. If you did not expect this email you can ignore it.`;
    const sent = await this.mail.send({
      to: customer.email,
      subject: first
        ? 'Set your password to access your Cynosure account'
        : 'Reset your Cynosure password',
      text: `Hello ${customer.name},\n\n${intro}\n\n${link}\n\n${expiry}`,
      html: `<p>Hello ${escapeHtml(customer.name)},</p><p>${intro}</p><p><a href="${link}">${first ? 'Set your password' : 'Reset your password'}</a></p><p>${expiry}</p>`,
    });
    if (!sent.sent)
      this.log.warn(`Link for ${customer.email} not emailed: ${sent.reason}`);
    return {
      status: first ? 'invited' : 'active',
      emailed: sent.sent,
      ...(sent.sent ? {} : { link, reason: sent.reason }),
    };
  }

  private async byToken(token: string) {
    const customer = await this.model
      .findOne({
        inviteTokenHash: hashToken(token),
        inviteExpiresAt: { $gt: new Date() },
      })
      .exec();
    if (!customer)
      throw new BadRequestException(
        'This link is invalid or has expired. Ask for a new one.',
      );
    return customer;
  }

  /** What the set-password page shows before the customer picks a password. */
  async describeToken(token: string) {
    const customer = await this.byToken(token);
    return { name: customer.name, email: customer.email };
  }

  async setPassword(token: string, password: string) {
    const customer = await this.byToken(token);
    const passwordHash = await bcrypt.hash(password, 10);

    let user = await this.users.findByEmail(customer.email);
    if (user && !user.roles.includes(Role.Customer)) {
      throw new ConflictException(
        'This email belongs to a staff account and cannot be used as a customer login.',
      );
    }
    if (user)
      await this.users.setPasswordHash(user._id.toString(), passwordHash);
    else
      user = await this.users.create({
        name: customer.name,
        email: customer.email,
        passwordHash,
        roles: [Role.Customer],
      });

    // Every customer record with this email (one per earlier PO) now has access.
    await this.model.updateMany(
      { email: customer.email },
      { $set: { userId: user._id } },
    );
    await this.model.updateMany(
      { email: customer.email, activatedAt: null },
      { $set: { activatedAt: new Date() } },
    );
    // The link works once.
    await this.model.updateMany(
      { email: customer.email },
      { $set: { inviteTokenHash: null, inviteExpiresAt: null } },
    );
    return { email: customer.email };
  }
}
