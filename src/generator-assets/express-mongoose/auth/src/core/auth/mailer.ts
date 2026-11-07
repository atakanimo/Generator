// @auth-file register|password-reset
import nodemailer, { type Transporter } from 'nodemailer';
import { optionalEnv } from '@config/env';
import { getAppLogger } from '@core/logging/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Set for a verification / reset code: a host may render its own template from it instead of `text`. */
  otp?: { purpose: 'verify' | 'reset'; code: string; name: string };
}

/** Sends mail through SMTP when `SMTP_HOST` is set; otherwise writes the message to the log (development). */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

let transporter: Transporter | null | undefined;

function smtp(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = optionalEnv('SMTP_HOST');
  transporter = host
    ? nodemailer.createTransport({
        host,
        port: Number(optionalEnv('SMTP_PORT') ?? 587),
        secure: Number(optionalEnv('SMTP_PORT') ?? 587) === 465,
        auth: optionalEnv('SMTP_USER') ? { user: optionalEnv('SMTP_USER')!, pass: optionalEnv('SMTP_PASSWORD') ?? '' } : undefined
      })
    : null;
  return transporter;
}

export const mailSender: MailSender = {
  async send(message) {
    const transport = smtp();
    if (!transport) {
      getAppLogger().info({ event: 'mail.console', to: message.to, subject: message.subject, text: message.text }, 'mail (SMTP_HOST yok)');
      return;
    }
    const { to, subject, text, html } = message;
    await transport.sendMail({ from: optionalEnv('MAIL_FROM') ?? optionalEnv('SMTP_USER'), to, subject, text, html });
  }
};
