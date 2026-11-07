/**
 * Security validation helpers for extension-dashboard communication (ST-037 / Issue 5)
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidWorkspaceId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export function isAllowedDashboardOrigin(origin: string, configuredAppUrl?: string): boolean {
  if (!origin || typeof origin !== 'string') return false;

  try {
    const trimmedOrigin = origin.trim().replace(/\/+$/, '');

    // Check against explicitly configured app URL if supplied
    if (configuredAppUrl) {
      try {
        const configuredOrigin = new URL(configuredAppUrl).origin;
        if (trimmedOrigin === configuredOrigin) return true;
      } catch {
        // Ignore invalid configuredAppUrl string
      }
    }

    // Default known development and production dashboard origins
    const allowedExactOrigins = [
      'https://snaptype.app',
      'https://app.snaptype.app',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];

    if (allowedExactOrigins.includes(trimmedOrigin)) {
      return true;
    }

    const parsed = new URL(trimmedOrigin);
    // Allow secure snaptype.app subdomains (e.g. staging.snaptype.app)
    if (parsed.protocol === 'https:' && (parsed.hostname === 'snaptype.app' || parsed.hostname.endsWith('.snaptype.app'))) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export interface DashboardWorkspaceChangeMessage {
  type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE';
  workspaceId: string;
}

export function validateDashboardMessage(
  eventData: unknown,
  eventOrigin: string,
  windowOrigin: string,
  configuredAppUrl?: string
): { valid: true; message: DashboardWorkspaceChangeMessage } | { valid: false; reason: string } {
  // 1. Validate event origin matches window origin (same-origin check)
  if (!eventOrigin || eventOrigin !== windowOrigin) {
    return { valid: false, reason: 'Origin mismatch between event and current window location' };
  }

  // 2. Validate origin against trusted dashboard origins
  if (!isAllowedDashboardOrigin(eventOrigin, configuredAppUrl)) {
    return { valid: false, reason: `Origin '${eventOrigin}' is not an authorized SnapType dashboard origin` };
  }

  // 3. Validate message payload schema
  if (!eventData || typeof eventData !== 'object') {
    return { valid: false, reason: 'Message payload is not an object' };
  }

  const payload = eventData as Record<string, unknown>;
  if (payload.type !== 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE') {
    return { valid: false, reason: `Unsupported or unknown message type: ${String(payload.type)}` };
  }

  if (!isValidWorkspaceId(payload.workspaceId)) {
    return { valid: false, reason: `Invalid workspaceId format (expected UUID): ${String(payload.workspaceId)}` };
  }

  return {
    valid: true,
    message: {
      type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE',
      workspaceId: (payload.workspaceId as string).trim()
    }
  };
}

