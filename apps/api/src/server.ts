import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
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
import { emailService } from './services/email.service.js';

dotenv.config();

export async function createServer(): Promise<FastifyInstance> {
  const app = fastify({
    logger: process.env.NODE_ENV === 'development' ? {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    } : { level: 'info' }
  });

  // CORS configuration
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow browser extensions (chrome-extension://, moz-extension://) and web app
      if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        cb(null, true);
        return;
      }
      cb(null, true);
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

  return app;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.env.PORT || '3000', 10);
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
  });
}
