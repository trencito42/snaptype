import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ST-005 & Release Blocker: Docker Compose Configuration Validation', () => {
  it('docker-compose.yml and .env.docker.example exist and have valid syntax', () => {
    const composeContent = fs.readFileSync(path.resolve('docker-compose.yml'), 'utf-8');
    const envContent = fs.readFileSync(path.resolve('.env.docker.example'), 'utf-8');

    expect(composeContent).toContain('services:');
    expect(composeContent).toContain('mysql:');
    expect(composeContent).toContain('api:');
    expect(composeContent).toContain('web:');
    expect(composeContent).toContain('ALLOWED_ORIGINS');

    // Verify all mapping values with error directives are safely enclosed in quotes
    const errorDirectiveLines = composeContent
      .split('\n')
      .filter((line) => line.includes(':?Error:'));

    for (const line of errorDirectiveLines) {
      expect(line.trim()).toMatch(/:\s*"\$\{.+?\}"/);
    }

    expect(envContent).toContain('ALLOWED_ORIGINS=');
    expect(envContent).toContain('MYSQL_ROOT_PASSWORD=');
    expect(envContent).toContain('JWT_SECRET=');
  });

  it('apps/api/Dockerfile copies infrastructure/migrations into final runner image', () => {
    const dockerfile = fs.readFileSync(path.resolve('apps/api/Dockerfile'), 'utf-8');

    // Builder stage copies infrastructure
    expect(dockerfile).toContain('COPY infrastructure/ ./infrastructure/');
    // Runner stage copies infrastructure from builder
    expect(dockerfile).toContain('COPY --from=builder /app/infrastructure ./infrastructure');
    expect(dockerfile).toContain('ENV NODE_ENV=production');
  });
});

