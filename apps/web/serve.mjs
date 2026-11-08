import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';

const root = resolve(process.cwd(), 'apps/web/dist');
const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

function sendText(res, status, body, extra = {}) {
  res.writeHead(status, {
    ...securityHeaders(),
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(body);
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('Missing apps/web/dist/index.html — run: npm run build:web');
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid SERVER_PORT/PORT: ${port}`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz') {
    const body = JSON.stringify({ status: 'ok', service: 'snaptype-web' });
    res.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    return sendText(res, 405, 'Method not allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    return sendText(res, 400, 'Bad request');
  }
  if (pathname.includes('\\') || pathname.includes('\0')) {
    return sendText(res, 400, 'Bad request');
  }

  let filename = resolve(root, '.' + pathname);
  if (filename !== root && !filename.startsWith(root + sep)) {
    return sendText(res, 403, 'Forbidden');
  }

  try {
    if (existsSync(filename) && statSync(filename).isDirectory()) {
      filename = join(filename, 'index.html');
    }
    if (!existsSync(filename) || !statSync(filename).isFile()) {
      if (extname(pathname)) {
        return sendText(res, 404, 'Not found');
      }
      filename = join(root, 'index.html');
    }

    const ext = extname(filename).toLowerCase();
    const type = types[ext] || 'application/octet-stream';
    const inAssets = filename.includes(`${sep}assets${sep}`);
    const cacheControl = inAssets
      ? 'public, max-age=31536000, immutable'
      : ext === '.html'
        ? 'no-cache'
        : pathname.startsWith('/fonts/')
          ? 'public, max-age=0, must-revalidate'
          : 'public, max-age=86400';

    res.writeHead(200, {
      ...securityHeaders(),
      'Content-Type': type,
      'Cache-Control': cacheControl,
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(filename).on('error', () => sendText(res, 500, 'Read error')).pipe(res);
  } catch {
    return sendText(res, 500, 'Server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`SnapType web listening on 0.0.0.0:${port} (dist: ${root})`);
});
