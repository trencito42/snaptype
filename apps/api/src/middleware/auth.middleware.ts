import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { User } from '@snaptype/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.slice(7).trim();
    const user = await authService.validateSessionToken(token);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired session' });
    }

    request.user = user;
  };
}
