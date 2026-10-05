import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends email through Resend's HTTP API. Without RESEND_API_KEY it sends nothing and says so. */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);

  constructor(private config: ConfigService) {}

  get configured() {
    return !!this.config.get<string>('RESEND_API_KEY');
  }

  async send(
    message: MailMessage,
  ): Promise<{ sent: boolean; reason?: string }> {
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) {
      this.log.warn(
        `RESEND_API_KEY is not set - email to ${message.to} not sent`,
      );
      return { sent: false, reason: 'Email is not configured on the server.' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:
            this.config.get<string>('MAIL_FROM') ??
            'Cynosure <onboarding@resend.dev>',
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        this.log.error(
          `Resend rejected the email (${res.status}): ${body?.message}`,
        );
        return {
          sent: false,
          reason: body?.message ?? `The email service answered ${res.status}.`,
        };
      }
      return { sent: true };
    } catch (err) {
      this.log.error(`Could not reach Resend: ${(err as Error).message}`);
      return { sent: false, reason: 'Could not reach the email service.' };
    }
  }
}
