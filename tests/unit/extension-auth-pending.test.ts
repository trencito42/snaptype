import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Extension OTP popup persistence', () => {
  it('persists pending OTP email in background storage across popup close', () => {
    const bg = fs.readFileSync(path.resolve('apps/extension/src/background/background.ts'), 'utf-8');
    expect(bg).toContain('snaptype_pending_otp_email');
    expect(bg).toContain('pendingOtpEmail');
    expect(bg).toMatch(/setPendingOtpEmail/);
    expect(bg).toMatch(/getPendingOtpEmail/);
  });

  it('popup resumes OTP step when pendingOtpEmail is returned from GET_DATA', () => {
    const popup = fs.readFileSync(path.resolve('apps/extension/src/popup/popup.ts'), 'utf-8');
    expect(popup).toContain('pendingOtpEmail');
    expect(popup).toContain("showAuthView(resumeEmail ? 'otp' : 'email'");
  });
});
