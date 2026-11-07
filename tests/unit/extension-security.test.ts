import { describe, it, expect } from 'vitest';
import {
  isAllowedDashboardOrigin,
  isValidWorkspaceId,
  validateDashboardMessage
} from '../../packages/shared/src/security.js';

describe('Issue 5: Secure Dashboard-to-Extension Communication', () => {
  describe('Origin Validation (isAllowedDashboardOrigin)', () => {
    it('accepts configured dashboard origins and localhost loopbacks', () => {
      expect(isAllowedDashboardOrigin('http://localhost:5173')).toBe(true);
      expect(isAllowedDashboardOrigin('http://127.0.0.1:5173')).toBe(true);
      expect(isAllowedDashboardOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedDashboardOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedDashboardOrigin('https://snaptype.app')).toBe(true);
      expect(isAllowedDashboardOrigin('https://app.snaptype.app')).toBe(true);
      expect(isAllowedDashboardOrigin('https://custom.snaptype.app')).toBe(true);
    });

    it('accepts explicitly configured custom app origins', () => {
      const customAppUrl = 'https://snippets.mycompany.internal:8443/app';
      expect(isAllowedDashboardOrigin('https://snippets.mycompany.internal:8443', customAppUrl)).toBe(true);
    });

    it('rejects untrusted, third-party, and spoofed origins', () => {
      expect(isAllowedDashboardOrigin('https://attacker.com')).toBe(false);
      expect(isAllowedDashboardOrigin('http://evil-snaptype.app')).toBe(false);
      expect(isAllowedDashboardOrigin('https://snaptype.app.evil.com')).toBe(false);
      expect(isAllowedDashboardOrigin('null')).toBe(false);
      expect(isAllowedDashboardOrigin('')).toBe(false);
      expect(isAllowedDashboardOrigin('file://')).toBe(false);
    });
  });

  describe('Workspace ID Validation (isValidWorkspaceId)', () => {
    it('accepts standard RFC 4122 UUIDs', () => {
      expect(isValidWorkspaceId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidWorkspaceId('b9a18ca7-1174-41dc-a062-4f783a47ad65')).toBe(true);
      expect(isValidWorkspaceId('4c8c279a-a82f-45a8-b61e-128a506b3bc4')).toBe(true);
    });

    it('rejects non-UUID strings, injections, and empty values', () => {
      expect(isValidWorkspaceId('')).toBe(false);
      expect(isValidWorkspaceId(null)).toBe(false);
      expect(isValidWorkspaceId(undefined)).toBe(false);
      expect(isValidWorkspaceId(12345)).toBe(false);
      expect(isValidWorkspaceId('default-workspace')).toBe(false);
      expect(isValidWorkspaceId("'; DROP TABLE workspaces; --")).toBe(false);
      expect(isValidWorkspaceId('../../etc/passwd')).toBe(false);
      expect(isValidWorkspaceId('123e4567-e89b-12d3-a456-42661417400Z')).toBe(false);
    });
  });

  describe('Dashboard Message Validation (validateDashboardMessage)', () => {
    const validWsId = '123e4567-e89b-12d3-a456-426614174000';
    const trustedOrigin = 'http://localhost:5173';

    it('accepts valid workspace change messages from trusted origins', () => {
      const result = validateDashboardMessage(
        { type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE', workspaceId: validWsId },
        trustedOrigin,
        trustedOrigin
      );

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.message.type).toBe('SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE');
        expect(result.message.workspaceId).toBe(validWsId);
      }
    });

    it('rejects messages if event.origin does not match window.location.origin (cross-origin spoofing)', () => {
      const result = validateDashboardMessage(
        { type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE', workspaceId: validWsId },
        'https://attacker.com',
        trustedOrigin
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('Origin mismatch');
      }
    });

    it('rejects messages originating from untrusted web pages', () => {
      const attackerOrigin = 'https://malicious-site.example.com';
      const result = validateDashboardMessage(
        { type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE', workspaceId: validWsId },
        attackerOrigin,
        attackerOrigin
      );

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('not an authorized SnapType dashboard origin');
      }
    });

    it('rejects malformed payloads and non-UUID workspace IDs', () => {
      // Missing payload
      expect(validateDashboardMessage(null, trustedOrigin, trustedOrigin).valid).toBe(false);

      // Wrong message type
      const wrongType = validateDashboardMessage(
        { type: 'SOME_OTHER_EVENT', workspaceId: validWsId },
        trustedOrigin,
        trustedOrigin
      );
      expect(wrongType.valid).toBe(false);

      // Malformed workspaceId
      const badWsId = validateDashboardMessage(
        { type: 'SNAPTYPE_DASHBOARD_WORKSPACE_CHANGE', workspaceId: 'fake-workspace-id' },
        trustedOrigin,
        trustedOrigin
      );
      expect(badWsId.valid).toBe(false);
      if (!badWsId.valid) {
        expect(badWsId.reason).toContain('Invalid workspaceId format');
      }
    });
  });
});

