/**
 * Wings / Pterodactyl exposes the instance allocation as SERVER_PORT.
 * Git Deploy also allows PORT in app.env for other hosts.
 */
export function resolveListenPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SERVER_PORT ?? env.PORT ?? '3000';
  const port = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid listen port (SERVER_PORT/PORT): ${raw}`);
  }
  return port;
}
