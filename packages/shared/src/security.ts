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

    // A production build is configured with the owner's real dashboard URL: trust ONLY that origin.
    // (No hard-coded product domains: trusting a domain the owner does not control would let any
    // page there change the user's selected workspace.)
    let configuredIsLoopback = true;
    if (configuredAppUrl) {
      try {
        const configured = new URL(configuredAppUrl);
        if (trimmedOrigin === configured.origin) return true;
        configuredIsLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
      } catch {
        // Invalid configuredAppUrl: fall back to development behaviour below
      }
    }
    if (!configuredIsLoopback) return false;

    // Development: the local dashboard and API dev origins only.
    const allowedDevOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ];
    return allowedDevOrigins.includes(trimmedOrigin);
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

