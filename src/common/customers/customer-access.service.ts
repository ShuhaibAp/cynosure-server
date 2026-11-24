import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getBrand } from '../brand.js';
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
    const appUrl = this.appUrl();
    const link = `${appUrl}/set-password?token=${token}`;
    const first = kind === 'invite';
    const brand = getBrand();
    const intro = first ? brand.inviteIntro : brand.resetIntro;
    const expiry = `This link is valid for ${INVITE_DAYS} days. If you did not expect this email you can safely ignore it.`;
    const ctaLabel = first ? 'Set Your Password' : 'Reset Your Password';
    const heading = first
      ? 'Welcome to your Customer Portal'
      : 'Reset your password';
    const bg = brand.theme === 'lterp' ? '#f4f7f6' : '#f6f5f3';
    const border = brand.theme === 'lterp' ? '#e1e8e5' : '#e7e5e0';
    const tint = brand.theme === 'lterp' ? '#e8f4ee' : '#fbede4';
    const tintBorder = brand.theme === 'lterp' ? '#bfdfd0' : '#f3d2bc';
    const textMain = brand.theme === 'lterp' ? '#14211c' : '#1f2020';
    const textMuted = brand.theme === 'lterp' ? '#4d5f58' : '#5d5c58';
    const logoUrl = `${appUrl}/${brand.logoFile}`;
    const highlights = first
      ? `<tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tint};border:1px solid ${tintBorder};border-radius:10px;">
              <tr>
                <td style="padding:16px 20px;font-size:13.5px;line-height:1.6;color:${textMain};">
                  <div style="font-weight:700;margin-bottom:6px;color:${brand.brandHex};">What you can do in the portal</div>
                  <div>&bull;&nbsp; Track your order live across every processing stage</div>
                  <div>&bull;&nbsp; Download your AOR and final compliance PDF reports</div>
                  <div>&bull;&nbsp; Notify our team whenever you have new material ready for pickup</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : '';
    const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${textMain};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="height:4px;background:${brand.brandHex};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid ${border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" valign="middle">
                    <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brand.companyName)}" height="36" style="display:block;height:36px;width:auto;border:0;" />
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${tint};border:1px solid ${tintBorder};color:${brand.brandHex};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Customer Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${textMain};">${heading}</h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${textMain};">Hello ${escapeHtml(customer.name)},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${textMuted};">${escapeHtml(intro)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td align="center" style="border-radius:8px;background:${brand.brandHex};">
                    <a href="${escapeHtml(link)}" target="_blank" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${highlights}
          <tr>
            <td style="padding:0 32px 24px;">
              <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${textMuted};">${escapeHtml(expiry)}</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:${textMuted};word-break:break-all;">If the button above does not work, copy and paste this link into your browser:<br /><a href="${escapeHtml(link)}" style="color:${brand.brandHex};text-decoration:underline;">${escapeHtml(link)}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;background:${bg};border-top:1px solid ${border};font-size:12px;color:${textMuted};text-align:center;">
              &copy; ${new Date().getFullYear()} ${escapeHtml(brand.companyName)} &middot; ${escapeHtml(brand.appName)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
    const sent = await this.mail.send({
      to: customer.email,
      subject: first ? brand.inviteSubject : brand.resetSubject,
      text: `Hello ${customer.name},\n\n${intro}\n\n${link}\n\n${expiry}`,
      html,
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
