import nodemailer from 'nodemailer';

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: { user, pass }
      });
      this.isConfigured = true;
    }
  }

  public getStatus() {
    return {
      isConfigured: this.isConfigured,
      host: process.env.SMTP_HOST || null,
      mode: this.isConfigured ? 'live_smtp' : 'local_console'
    };
  }

  public async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const from = process.env.SMTP_FROM || 'SnapType <noreply@snaptype.app>';
    const subject = `Your SnapType verification code: ${code}`;

    const textContent = `Welcome to SnapType.

Your single-use 6-digit verification code is: ${code}

This code will expire in 10 minutes. If you did not request this verification code, please ignore this email.

---
SnapType - Production-ready text expansion platform.
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #fcfcfa; color: #101110; padding: 40px 20px; margin: 0; }
    .container { max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e8e2; border-radius: 12px; padding: 36px 32px; }
    .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #101110; margin-bottom: 24px; display: inline-block; }
    .accent { color: #10200d; background: #85f66a; padding: 2px 8px; border-radius: 6px; }
    .title { font-size: 24px; font-weight: 700; line-height: 1.25; margin: 0 0 12px 0; }
    .desc { font-size: 15px; color: #686b66; line-height: 1.5; margin: 0 0 28px 0; }
    .code-box { background: #f6f7f4; border: 1px solid #e5e8e2; border-radius: 8px; padding: 18px 0; text-align: center; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #101110; margin-bottom: 28px; font-family: monospace; }
    .footer { font-size: 12px; color: #686b66; border-top: 1px solid #e5e8e2; padding-top: 20px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">Snap<span class="accent">Type</span></div>
    <h1 class="title">Verify your email</h1>
    <p class="desc">Enter the verification code below to access your SnapType account. The code will expire in 10 minutes.</p>
    <div class="code-box">${code}</div>
    <p class="desc" style="font-size: 13px;">If you did not request this code, you can safely disregard this message.</p>
    <div class="footer">
      SnapType Platform &bull; High-performance text expansion &bull; Reliability and speed first
    </div>
  </div>
</body>
</html>
`;

    const isProduction = process.env.NODE_ENV === 'production';

    if (this.isConfigured && this.transporter) {
      try {
        await this.transporter.sendMail({
          from,
          to: email,
          subject,
          text: textContent,
          html: htmlContent
        });
        return true;
      } catch (err: any) {
        console.error(`[Email Error] Failed to send email via SMTP to ${email}: ${err.message}`);
        // NEVER log OTP codes in production
        if (!isProduction) {
          console.log(`[Email Dev Fallback] Local code for ${email}: [ ${code} ]`);
        }
        return false;
      }
    } else {
      if (isProduction) {
        console.error(`[Email Error] SMTP is not configured in production environment.`);
        return false;
      }
      // Explicit development/testing console logging only
      console.log(`\n============================================================`);
      console.log(`[SnapType Auth (Dev)] Email Verification Code for: ${email}`);
      console.log(`>>> CODE: [ ${code} ] <<< (Expires in 10 minutes)`);
      console.log(`============================================================\n`);
      return true;
    }
  }
}

export const emailService = new EmailService();

