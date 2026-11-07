import crypto from 'node:crypto';
import { IRepository } from '../db/repository.js';
import { emailService } from './email.service.js';
import { User } from '@snaptype/shared';

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_VERIFY_ATTEMPTS = 5;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AuthService {
  private hmacSecret: string;

  constructor(private repo: IRepository) {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = process.env.OTP_HMAC_SECRET;
    if (isProduction && (!secret || secret.length < 32)) {
      throw new Error('[Security Fatal] OTP_HMAC_SECRET must be set and at least 32 characters long in production.');
    }
    this.hmacSecret = secret || 'snaptype-default-dev-hmac-secret-32-chars!';
  }

  private hashOTP(email: string, code: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${email.toLowerCase().trim()}:${code}`)
      .digest('hex');
  }

  private hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  public async requestOTP(email: string): Promise<{ success: boolean; cooldownRemaining?: number; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check recent challenge cooldown
    const latest = await this.repo.findLatestChallenge(normalizedEmail);
    if (latest && !latest.verifiedAt) {
      const elapsed = Date.now() - latest.createdAt.getTime();
      if (elapsed < OTP_COOLDOWN_MS) {
        const cooldownRemaining = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
        return {
          success: false,
          cooldownRemaining,
          message: `Please wait ${cooldownRemaining} seconds before requesting a new code.`
        };
      }
    }

    // Generate secure 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = this.hashOTP(normalizedEmail, code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.repo.createEmailChallenge(normalizedEmail, hashedCode, expiresAt);

    // Send email (no OTP logged here)
    const sent = await emailService.sendVerificationCode(normalizedEmail, code);
    if (!sent) {
      // Void the undelivered challenge so the user is not locked out by the resend cooldown
      // for a code they never received.
      const undelivered = await this.repo.findLatestChallenge(normalizedEmail);
      if (undelivered && !undelivered.verifiedAt) {
        await this.repo.markChallengeVerified(undelivered.id);
      }
      return {
        success: false,
        message: 'Unable to deliver verification email. Please check your email address or SMTP configuration.'
      };
    }

    return {
      success: true,
      message: 'Verification code sent to your email.'
    };
  }

  public async verifyOTP(
    email: string,
    code: string,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<{
    success: boolean;
    token?: string;
    user?: User;
    isNewUser?: boolean;
    error?: string;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    const challenge = await this.repo.findLatestChallenge(normalizedEmail);

    if (!challenge) {
      return { success: false, error: 'No verification request found. Please request a new code.' };
    }

    if (challenge.verifiedAt) {
      return { success: false, error: 'This verification code has already been used. Please request a new code.' };
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      return { success: false, error: 'Verification code has expired. Please request a new code.' };
    }

    if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      return { success: false, error: 'Too many incorrect attempts. Please request a new code.' };
    }

    const expectedHash = this.hashOTP(normalizedEmail, code.trim());
    if (challenge.hashedCode !== expectedHash) {
      await this.repo.incrementChallengeAttempts(challenge.id);
      const remaining = MAX_VERIFY_ATTEMPTS - (challenge.attempts + 1);
      return {
        success: false,
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Code invalidated.'}`
      };
    }

    // Atomically mark challenge as used (ST-029)
    const claimed = await this.repo.markChallengeVerified(challenge.id);
    if (!claimed) {
      return { success: false, error: 'This verification code has already been used. Please request a new code.' };
    }

    // Find or create user
    let user = await this.repo.findUserByEmail(normalizedEmail);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await this.repo.createUser(normalizedEmail);

      // Create personal workspace
      const personalWs = await this.repo.createWorkspace('Personal', 'personal-' + user.id.slice(0, 8), user.id, true);

      // Seed starter snippets
      await this.seedStarterSnippets(personalWs.id, user.id);
    }

    // Create session token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await this.repo.createSession(user.id, tokenHash, expiresAt, metadata?.userAgent, metadata?.ipAddress);

    return {
      success: true,
      token: rawToken,
      user,
      isNewUser
    };
  }

  public async createSessionForUser(userId: string, metadata?: { userAgent?: string; ipAddress?: string }): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await this.repo.createSession(userId, tokenHash, expiresAt, metadata?.userAgent, metadata?.ipAddress);
    return rawToken;
  }

  public async completeRegistration(userId: string, name: string): Promise<User> {
    return this.repo.updateUser(userId, { name: name.trim() });
  }

  public async validateSessionToken(token: string): Promise<User | null> {
    if (!token) return null;
    const tokenHash = this.hashSessionToken(token);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (!session) return null;

    return this.repo.findUserById(session.userId);
  }

  public async revokeSession(token: string): Promise<void> {
    if (!token) return;
    const tokenHash = this.hashSessionToken(token);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (session) {
      await this.repo.deleteSession(session.id);
    }
  }

  public async revokeAllUserSessions(userId: string): Promise<void> {
    await this.repo.deleteUserSessions(userId);
  }

  private async seedStarterSnippets(workspaceId: string, userId: string): Promise<void> {
    // 1. msver
    await this.repo.createSnippet(workspaceId, {
      name: 'Verificare cont',
      shortcut: 'msver',
      plainContent: 'Bună ziua,\n\nVă informăm că verificarea contului dumneavoastră a fost finalizată cu succes.\n\nVă dorim o zi excelentă!',
      description: 'Confirmare verificare realizată',
      tags: ['suport', 'verificare'],
      isFavorite: true
    }, userId);

    // 2. cerbonus
    await this.repo.createSnippet(workspaceId, {
      name: 'Cerere bonus',
      shortcut: 'cerbonus',
      plainContent: 'Bună ziua,\n\nVă mulțumim pentru mesaj.\n\nPentru a putea verifica solicitarea dumneavoastră legată de bonus, avem nevoie de informații suplimentare.\n\nVă stăm cu plăcere la dispoziție.',
      description: 'Solicitare detalii bonus',
      tags: ['suport', 'bonus'],
      isFavorite: true
    }, userId);

    // 3. /salut (with dynamic input)
    await this.repo.createSnippet(workspaceId, {
      name: 'Salutare client',
      shortcut: '/salut',
      plainContent: 'Bună ziua, {{input:numeClient|label="Nume client"|default="stimate client"}},\n\nCu ce vă putem ajuta astăzi?',
      description: 'Formulă de salut personalizată',
      tags: ['comun', 'salut'],
      isFavorite: true
    }, userId);

    // 4. /closing (with current date & time)
    await this.repo.createSnippet(workspaceId, {
      name: 'Încheiere mesaj',
      shortcut: '/closing',
      plainContent: 'Dacă mai aveți și alte întrebări, vă rugăm să nu ezitați să ne contactați.\n\nGenerat pe data de {{date}} la {{time}}.\n\nO zi plăcută!',
      description: 'Formulă încheiere cu timestamp',
      tags: ['comun', 'incheiere'],
      isFavorite: false
    }, userId);

    // 5. retragere
    await this.repo.createSnippet(workspaceId, {
      name: 'Detalii retragere',
      shortcut: 'retragere',
      plainContent: 'Solicitarea dumneavoastră de retragere se află în procesare. Procesarea standard durează între 24 și 48 de ore lucrătoare.\n\nVă mulțumim pentru răbdare.',
      description: 'Notificare timp procesare retragere',
      tags: ['financiar'],
      isFavorite: false
    }, userId);
  }
}

