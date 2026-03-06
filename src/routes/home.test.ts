import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import homeRoutes from './home.js';

describe('home routes', () => {
  let app: FastifyInstance;
  const originalCwd = process.cwd();
  const tempDirs: string[] = [];

  beforeEach(async () => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
    process.chdir(originalCwd);
    for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('serves the landing page with api explorer markup', async () => {
    await app.register(homeRoutes);

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Live API Explorer');
    expect(response.body).toContain('--color-bg');
    expect(response.body).toContain('/docs');
    expect(response.body).toContain('http://localhost:3000/v1');
    expect(response.body).toContain('POST /v1/tools/impermanent-loss/simulate');
    expect(response.body).toContain("--font-heading: 'Source Serif 4', Georgia, serif;");
    expect(response.body).toContain("--font-body: 'DM Sans', system-ui, sans-serif;");
    expect(response.body).toContain('Skip to content');
    expect(response.body).toContain('family=DM+Sans:wght@400;500;600;700');
    expect(response.body).toContain('family=Source+Serif+4:wght@400;500;600;700');
  });

  it('keeps default body font when only heading font is overridden via brand.json', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'defi-data-api-home-'));
    tempDirs.push(tempDir);

    writeFileSync(
      join(tempDir, 'brand.json'),
      JSON.stringify({
        accentColor: '#1f7a5f',
        fontPairing: {
          heading: 'Fraunces',
        },
      })
    );
    process.chdir(tempDir);

    await app.register(homeRoutes);

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('--color-accent: #1f7a5f;');
    expect(response.body).toContain("--font-heading: 'Fraunces', Georgia, serif;");
    expect(response.body).toContain("--font-body: 'DM Sans', system-ui, sans-serif;");
    expect(response.body).toContain('family=Fraunces:wght@400;500;600;700');
  });

  it('applies safe custom token overrides from brand.json', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'defi-data-api-home-'));
    tempDirs.push(tempDir);

    writeFileSync(
      join(tempDir, 'brand.json'),
      JSON.stringify({
        customTokens: {
          colorBg: '#f6f1ea',
          '--space-20': '80px',
          customHeroGap: '40px',
          'invalid;name': '12px',
        },
      })
    );
    process.chdir(tempDir);

    await app.register(homeRoutes);

    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'localhost:3000',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('--color-bg: #f6f1ea;');
    expect(response.body).toContain('--space-20: 80px;');
    expect(response.body).toContain('--custom-hero-gap: 40px;');
    expect(response.body).not.toContain('--invalid;name');
  });
});
