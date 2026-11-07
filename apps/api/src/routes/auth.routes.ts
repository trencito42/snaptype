import { FastifyInstance } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { RequestOTPSchema, VerifyOTPSchema } from '@snaptype/shared';
import { emailService } from '../services/email.service.js';

export async function authRoutes(app: FastifyInstance, authService: AuthService) {
  // Request OTP
  app.post('/api/v1/auth/request-otp', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parseResult = RequestOTPSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid email address',
        details: parseResult.error.flatten()
      });
    }

    const { email } = parseResult.data;
    const result = await authService.requestOTP(email);

    if (!result.success) {
      const statusCode = result.cooldownRemaining ? 429 : 503;
      return reply.status(statusCode).send({
        error: result.message,
        cooldownRemaining: result.cooldownRemaining
      });
    }

    return reply.status(200).send({
      success: true,
      message: result.message
    });
  });

  // Verify OTP
  app.post('/api/v1/auth/verify-otp', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parseResult = VerifyOTPSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid code or email format',
        details: parseResult.error.flatten()
      });
    }

    const { email, code } = parseResult.data;
    const userAgent = request.headers['user-agent'] || undefined;
    const ipAddress = request.ip || undefined;

    const result = await authService.verifyOTP(email, code, { userAgent, ipAddress });

    if (!result.success) {
      return reply.status(401).send({ error: result.error });
    }

    return reply.status(200).send({
      success: true,
      token: result.token,
      user: result.user,
      isNewUser: result.isNewUser
    });
  });

  // Logout
  app.post('/api/v1/auth/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      await authService.revokeSession(token);
    }
    return reply.status(200).send({ success: true, message: 'Logged out successfully' });
  });

  // Auth Status (for diagnosis/UI indicator)
  app.get('/api/v1/auth/status', async () => {
    return {
      emailStatus: emailService.getStatus(),
      authMode: 'email_otp'
    };
  });
}

