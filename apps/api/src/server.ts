import 'dotenv/config';
import fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { initDatabase, getDatabaseStatus, getRepository } from './db/connection.js';
import { AuthService } from './services/auth.service.js';
import { SnippetService } from './services/snippet.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { userRoutes } from './routes/user.routes.js';
import { workspaceRoutes } from './routes/workspace.routes.js';
import { folderRoutes } from './routes/folder.routes.js';
import { snippetRoutes } from './routes/snippet.routes.js';
import { syncRoutes } from './routes/sync.routes.js';
import { transferRoutes } from './routes/transfer.routes.js';
import { tableRoutes } from './routes/table.routes.js';
import { emailService } from './services/email.service.js';
import { redactUrl } from './log-redact.js';
import { resolveListenPort } from '@snaptype/shared';

export async function createServer(): Promise<FastifyInstance> {
  const logSerializers = {
    // Never write invitation/session tokens or codes that travel in query strings into the logs.
    req(request: FastifyRequest) {
      return {
        method: request.method,
        url: redactUrl(request.url),
        host: request.headers?.host,
        remoteAddress: request.ip
      };
    }
  };
  const app = fastify({
    // Behind the bundled nginx reverse proxy the client IP is in X-Forwarded-For; without this the
    // rate limiter and session metadata see only the proxy address. Opt-in via TRUST_PROXY=true.
    trustProxy: process.env.TRUST_PROXY === 'true',
    logger: process.env.NODE_ENV === 'development' ? {
      level: 'info',
      serializers: logSerializers,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    } : { level: 'info', serializers: logSerializers }
  });

  // CORS configuration (ST-027)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean);

  if (process.env.APP_URL) {
    try {
      const appOrigin = new URL(process.env.APP_URL).origin.toLowerCase();
      if (!allowedOrigins.includes(appOrigin)) {
        allowedOrigins.push(appOrigin);
      }
    } catch {
      // Ignore URL parse error
    }
  }

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow non-browser requests (e.g. mobile, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      // Allow browser extensions (chrome-extension://, moz-extension://)
      if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
        cb(null, true);
        return;
      }

      const lowerOrigin = origin.toLowerCase();

      // Check configured allowed origins
      if (allowedOrigins.some((allowed) => lowerOrigin === allowed || lowerOrigin.endsWith('.' + allowed))) {
        cb(null, true);
        return;
      }

      // Allow localhost / 127.0.0.1 in non-production environments
      if (process.env.NODE_ENV !== 'production' && (lowerOrigin.includes('localhost') || lowerOrigin.includes('127.0.0.1'))) {
        cb(null, true);
        return;
      }

      // Reject all unauthorized origins
      cb(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // Global rate limiter
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  });

  // Initialize DB repository
  const repo = await initDatabase();
  const authService = new AuthService(repo);
  const snippetService = new SnippetService(repo);

  // Health check
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: getDatabaseStatus(),
      email: emailService.getStatus()
    };
  });

  // Register routes
  await authRoutes(app, authService);
  await userRoutes(app, repo, authService);
  await workspaceRoutes(app, repo, authService);
  await folderRoutes(app, repo, authService);
  await snippetRoutes(app, repo, authService, snippetService);
  await syncRoutes(app, repo, authService);
  await transferRoutes(app, repo, authService, snippetService);
  await tableRoutes(app, repo, authService);

  return app;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  let port: number;
  try {
    port = resolveListenPort();
  } catch (err) {
    console.error('[Fatal]', err instanceof Error ? err.message : err);
    process.exit(1);
  }
  const host = process.env.HOST || '0.0.0.0';

  createServer().then((server) => {
    server.listen({ port, host }, (err, address) => {
      if (err) {
        server.log.error(err);
        process.exit(1);
      }
      console.log(`\n============================================================`);
      console.log(`🚀 SnapType API server listening on ${address}`);
      console.log(`📊 Health check: ${address}/health`);
      console.log(`============================================================\n`);
    });
  }).catch((err) => {
    console.error('[Fatal Server Startup Error]', err);
    process.exit(1);
  });
}

