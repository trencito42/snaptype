/** Removes secrets (invitation/session tokens, codes) from URLs before they are written to logs. */
const SENSITIVE_PARAMS = new Set(['token', 'code', 'otp', 'password', 'secret', 'key']);

export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q === -1) return url;
  const params = new URLSearchParams(url.slice(q + 1));
  let changed = false;
  for (const name of [...params.keys()]) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
      params.set(name, '[redacted]');
      changed = true;
    }
  }
  return changed ? `${url.slice(0, q)}?${params.toString().replace(/%5Bredacted%5D/g, '[redacted]')}` : url;
}
