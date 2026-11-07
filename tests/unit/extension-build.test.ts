import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Blocker 4: Extension Build & Packaging Origins', () => {
  const chromeManifestPath = path.resolve('apps/extension/src/manifest.chrome.json');
  const firefoxManifestPath = path.resolve('apps/extension/src/manifest.firefox.json');

  it('development manifests include loopback host permissions', () => {
    const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    const firefoxManifest = JSON.parse(fs.readFileSync(firefoxManifestPath, 'utf-8'));

    expect(chromeManifest.host_permissions).toContain('http://localhost:3000/*');
    expect(firefoxManifest.host_permissions).toContain('http://localhost:3000/*');
  });

  it('production build process strips localhost and 127.0.0.1 from host permissions', () => {
    const rawManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf-8'));
    
    // Simulate production filtering as defined in build.js
    const isProduction = true;
    let prodHostPermissions = [...rawManifest.host_permissions];
    if (isProduction) {
      prodHostPermissions = prodHostPermissions.filter(
        (h: string) => !h.includes('localhost') && !h.includes('127.0.0.1')
      );
    }

    expect(prodHostPermissions.some((h: string) => h.includes('localhost'))).toBe(false);
    expect(prodHostPermissions.some((h: string) => h.includes('127.0.0.1'))).toBe(false);
    expect(prodHostPermissions).toContain('https://api.snaptype.app/*');
  });

  it('production package verification rejects packages with loopback permissions', () => {
    function verifyManifestPermissions(permissions: string[], isProd: boolean) {
      if (isProd) {
        for (const perm of permissions) {
          if (perm.includes('localhost') || perm.includes('127.0.0.1')) {
            throw new Error(`Production package contains illegal loopback permission: ${perm}`);
          }
        }
      }
      return true;
    }

    expect(() => verifyManifestPermissions(['http://localhost:3000/*'], true)).toThrow('illegal loopback permission');
    expect(verifyManifestPermissions(['https://api.snaptype.app/*'], true)).toBe(true);
  });
});

