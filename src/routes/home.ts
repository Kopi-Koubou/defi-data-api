import { readFileSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface HomeBrandConfig {
  palette?: string;
  accentColor?: string;
  fontPairing?: {
    heading?: string;
    body?: string;
  };
  customTokens?: Record<string, unknown>;
}

interface HomeDesignTokens {
  colorBg: string;
  colorSurface: string;
  colorText: string;
  colorTextMuted: string;
  colorBorder: string;
  colorAccent: string;
  colorAccentSoft: string;
  colorMonoBg: string;
  colorInputBg: string;
  colorButtonText: string;
  fontHeading: string;
  fontBody: string;
}

const DEFAULT_TOKENS: HomeDesignTokens = {
  colorBg: '#f8f7f4',
  colorSurface: '#fffdfa',
  colorText: '#1c1a17',
  colorTextMuted: '#6d675f',
  colorBorder: '#e7e1d8',
  colorAccent: '#c96b3c',
  colorAccentSoft: '#f3e8e0',
  colorMonoBg: '#f4f0ea',
  colorInputBg: '#fffdf9',
  colorButtonText: '#fffdfa',
  fontHeading: "'Source Serif 4', Georgia, serif",
  fontBody: "'DM Sans', system-ui, sans-serif",
};

const PALETTE_TOKENS: Record<string, Partial<HomeDesignTokens>> = {
  'warm-neutral': {
    colorBg: '#f8f7f4',
    colorSurface: '#fffdfa',
    colorText: '#1c1a17',
    colorTextMuted: '#6d675f',
    colorBorder: '#e7e1d8',
    colorAccentSoft: '#f3e8e0',
    colorMonoBg: '#f4f0ea',
    colorInputBg: '#fffdf9',
    colorButtonText: '#fffdfa',
  },
  'cool-professional': {
    colorBg: '#f5f6f5',
    colorSurface: '#fcfcfa',
    colorText: '#1c1f22',
    colorTextMuted: '#67707a',
    colorBorder: '#dde3e8',
    colorAccent: '#2f6f8f',
    colorAccentSoft: '#e4eef3',
    colorMonoBg: '#edf1f4',
    colorInputBg: '#fafcfd',
    colorButtonText: '#fdfcf9',
  },
  'bold-minimal': {
    colorBg: '#f9f4ec',
    colorSurface: '#fffaf0',
    colorText: '#1f1a14',
    colorTextMuted: '#6e6458',
    colorBorder: '#e8dccf',
    colorAccent: '#b25d2a',
    colorAccentSoft: '#f4e6db',
    colorMonoBg: '#f2e8dd',
    colorInputBg: '#fff9f1',
    colorButtonText: '#fff9f1',
  },
  'dark-premium': {
    colorBg: '#121210',
    colorSurface: '#1b1a18',
    colorText: '#ebe6dd',
    colorTextMuted: '#a59d90',
    colorBorder: '#2d2a24',
    colorAccent: '#d28b57',
    colorAccentSoft: '#33251b',
    colorMonoBg: '#201e1a',
    colorInputBg: '#24211c',
    colorButtonText: '#1b1a18',
  },
};

const TOKEN_KEY_MAP: Record<string, keyof HomeDesignTokens> = {
  '--color-bg': 'colorBg',
  '--color-surface': 'colorSurface',
  '--color-text': 'colorText',
  '--color-text-muted': 'colorTextMuted',
  '--color-border': 'colorBorder',
  '--color-accent': 'colorAccent',
  '--color-accent-soft': 'colorAccentSoft',
  '--color-mono-bg': 'colorMonoBg',
  '--color-input-bg': 'colorInputBg',
  '--color-button-text': 'colorButtonText',
  '--font-heading': 'fontHeading',
  '--font-body': 'fontBody',
};

function toCssVariableName(key: string): string {
  if (!key) {
    return '';
  }

  const normalized = key.trim();
  if (!normalized) {
    return '';
  }

  return normalized.startsWith('--')
    ? normalized
    : `--${normalized.replace(/_/g, '-').replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function sanitizeCssValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (/[{};]/.test(normalized)) {
    return null;
  }

  return normalized;
}

function sanitizeFontName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!/^[a-zA-Z0-9\s-]+$/.test(normalized)) {
    return null;
  }

  return normalized.replace(/\s+/g, ' ');
}

function buildFontStack(fontName: string | null, fallback: string): string {
  if (!fontName) {
    return fallback;
  }

  return `'${fontName}', ${fallback}`;
}

function extractPrimaryFontFamily(fontStack: string): string | null {
  const normalized = fontStack.trim();
  if (!normalized) {
    return null;
  }

  const quotedMatch = normalized.match(/^['"]([^'"]+)['"]/);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const firstSegment = normalized.split(',')[0]?.trim() || '';
  if (!firstSegment) {
    return null;
  }

  const cleanSegment = firstSegment.replace(/^['"]|['"]$/g, '');
  const genericFamilies = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
  ]);

  if (genericFamilies.has(cleanSegment.toLowerCase())) {
    return null;
  }

  return cleanSegment;
}

function isSafeFontFamily(value: string): boolean {
  return /^[a-zA-Z0-9\s-]+$/.test(value);
}

function buildGoogleFontsHref(tokens: HomeDesignTokens): string {
  const families = new Set<string>(['DM Sans', 'Source Serif 4']);

  const headingFont = extractPrimaryFontFamily(tokens.fontHeading);
  const bodyFont = extractPrimaryFontFamily(tokens.fontBody);

  if (headingFont && isSafeFontFamily(headingFont)) {
    families.add(headingFont);
  }

  if (bodyFont && isSafeFontFamily(bodyFont)) {
    families.add(bodyFont);
  }

  const query = Array.from(families)
    .map((family) => `family=${family.trim().split(/\s+/).join('+')}:wght@400;500;600;700`)
    .join('&');

  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

function resolveProjectBrandConfig(projectRoot: string): HomeBrandConfig | null {
  try {
    const brandPath = join(projectRoot, 'brand.json');
    const raw = readFileSync(brandPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as HomeBrandConfig;
  } catch {
    return null;
  }
}

function resolveHomeDesignTokens(projectRoot: string): HomeDesignTokens {
  const brand = resolveProjectBrandConfig(projectRoot);
  const paletteTokens = brand?.palette ? PALETTE_TOKENS[brand.palette] || {} : {};
  const tokens: HomeDesignTokens = {
    ...DEFAULT_TOKENS,
    ...paletteTokens,
  };

  const accentOverride = sanitizeCssValue(brand?.accentColor);
  if (accentOverride) {
    tokens.colorAccent = accentOverride;
  }

  const headingOverride = sanitizeFontName(brand?.fontPairing?.heading);
  if (headingOverride) {
    tokens.fontHeading = buildFontStack(headingOverride, 'Georgia, serif');
  }

  const bodyOverride = sanitizeFontName(brand?.fontPairing?.body);
  if (bodyOverride) {
    tokens.fontBody = buildFontStack(bodyOverride, 'system-ui, sans-serif');
  }

  if (brand?.customTokens && typeof brand.customTokens === 'object') {
    for (const [rawKey, rawValue] of Object.entries(brand.customTokens)) {
      const cssVariable = toCssVariableName(rawKey);
      const tokenKey = TOKEN_KEY_MAP[cssVariable];
      const tokenValue = sanitizeCssValue(rawValue);

      if (!tokenKey || !tokenValue) {
        continue;
      }

      tokens[tokenKey] = tokenValue;
    }
  }

  return tokens;
}

function renderHomePage(origin: string, tokens: HomeDesignTokens): string {
  const baseApiUrl = `${origin}/v1`;
  const googleFontsHref = buildGoogleFontsHref(tokens);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DeFi Data API</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${googleFontsHref}" rel="stylesheet" />
    <style>
      :root {
        --color-bg: ${tokens.colorBg};
        --color-surface: ${tokens.colorSurface};
        --color-text: ${tokens.colorText};
        --color-text-muted: ${tokens.colorTextMuted};
        --color-border: ${tokens.colorBorder};
        --color-accent: ${tokens.colorAccent};
        --color-accent-soft: ${tokens.colorAccentSoft};
        --color-mono-bg: ${tokens.colorMonoBg};
        --color-input-bg: ${tokens.colorInputBg};
        --color-button-text: ${tokens.colorButtonText};
        --font-heading: ${tokens.fontHeading};
        --font-body: ${tokens.fontBody};
        --space-1: 4px;
        --space-2: 8px;
        --space-3: 12px;
        --space-4: 16px;
        --space-6: 24px;
        --space-8: 32px;
        --space-12: 48px;
        --space-16: 64px;
        --duration-fast: 150ms;
        --duration-normal: 250ms;
        --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--color-bg);
        color: var(--color-text);
        font-family: var(--font-body);
        font-size: 16px;
        line-height: 1.55;
      }

      .skip-link {
        position: absolute;
        left: var(--space-4);
        top: -200px;
        padding: var(--space-2) var(--space-3);
        border-radius: 8px;
        background: var(--color-surface);
        color: var(--color-text);
        border: 1px solid var(--color-border);
        text-decoration: none;
      }

      .skip-link:focus-visible {
        top: var(--space-4);
        outline: 3px solid var(--color-accent);
        outline-offset: 2px;
      }

      .layout {
        max-width: 1120px;
        margin: 0 auto;
        padding: var(--space-12) var(--space-6);
      }

      .nav {
        display: flex;
        gap: var(--space-4);
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--space-12);
      }

      .brand {
        font-family: var(--font-heading);
        font-size: 24px;
        letter-spacing: -0.01em;
        margin: 0;
      }

      .nav-links {
        display: flex;
        gap: var(--space-3);
      }

      .link {
        font-size: 14px;
        text-decoration: none;
        color: var(--color-text);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: var(--space-2) var(--space-3);
        transition:
          border-color var(--duration-fast) var(--ease-out),
          background-color var(--duration-fast) var(--ease-out),
          transform var(--duration-fast) var(--ease-out);
      }

      .link:hover {
        border-color: var(--color-accent);
        background: var(--color-accent-soft);
      }

      .link:active {
        transform: scale(0.98);
      }

      .hero {
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        gap: var(--space-8);
        margin-bottom: var(--space-12);
      }

      .headline {
        font-family: var(--font-heading);
        font-size: 40px;
        line-height: 1.05;
        letter-spacing: -0.02em;
        margin: 0 0 var(--space-4);
      }

      .lede {
        margin: 0;
        color: var(--color-text-muted);
        max-width: 58ch;
      }

      .cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-6);
      }

      .card {
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: var(--color-surface);
        padding: var(--space-6);
      }

      .card-title {
        font-size: 24px;
        font-family: var(--font-heading);
        margin: 0 0 var(--space-3);
        letter-spacing: -0.01em;
      }

      .muted {
        color: var(--color-text-muted);
        margin: 0 0 var(--space-4);
      }

      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 14px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-mono-bg);
        padding: var(--space-3);
        overflow-x: auto;
        margin: 0;
      }

      .grid {
        display: grid;
        gap: var(--space-4);
      }

      label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: var(--space-2);
      }

      input,
      select,
      textarea,
      button {
        font: inherit;
      }

      input,
      select,
      textarea {
        width: 100%;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-input-bg);
        color: var(--color-text);
        padding: var(--space-3);
        transition:
          border-color var(--duration-fast) var(--ease-out),
          box-shadow var(--duration-fast) var(--ease-out);
      }

      textarea {
        min-height: 120px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 14px;
      }

      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      button:focus-visible,
      .link:focus-visible {
        outline: 3px solid var(--color-accent);
        outline-offset: 2px;
      }

      .button {
        min-height: 44px;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 0 var(--space-4);
        background: var(--color-accent);
        color: var(--color-button-text);
        font-weight: 600;
        cursor: pointer;
        transition:
          filter var(--duration-fast) var(--ease-out),
          transform var(--duration-fast) var(--ease-out);
      }

      .button:hover {
        filter: brightness(1.06);
      }

      .button:active {
        transform: scale(0.98);
      }

      .response {
        margin-top: var(--space-4);
      }

      .response-status {
        font-size: 14px;
        margin-bottom: var(--space-2);
        color: var(--color-text-muted);
      }

      .accent {
        color: var(--color-accent);
      }

      .footer {
        margin-top: var(--space-12);
        padding-top: var(--space-6);
        border-top: 1px solid var(--color-border);
        color: var(--color-text-muted);
        font-size: 14px;
      }

      @media (max-width: 980px) {
        .layout {
          padding: var(--space-8) var(--space-4);
        }

        .hero,
        .cards {
          grid-template-columns: 1fr;
        }

        .headline {
          font-size: 32px;
        }

        .nav {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0ms !important;
          transition-duration: 0ms !important;
          scroll-behavior: auto !important;
        }

        .button:active,
        .link:active {
          transform: none;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content" class="layout">
      <header class="nav">
        <h1 class="brand">DeFi Data API</h1>
        <div class="nav-links">
          <a class="link" href="/docs">OpenAPI Docs</a>
          <a class="link" href="https://github.com/xadev12/defi-data-api" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>

      <section class="hero">
        <div>
          <h2 class="headline">Unified DeFi yields, TVL, tokens, and analytics in one API.</h2>
          <p class="lede">
            Built for shipping dashboards, bots, and analytics products quickly. Query normalized
            data across major DeFi protocols with consistent response shapes and tier-aware limits.
          </p>
        </div>
        <div class="card">
          <h3 class="card-title">Quick Start</h3>
          <p class="muted">Use a test key in local development.</p>
          <pre class="mono">curl -H "x-api-key: test-builder-key-67890" \\
  "${baseApiUrl}/yields/top"</pre>
        </div>
      </section>

      <section class="cards">
        <article class="card">
          <h3 class="card-title">Live API Explorer</h3>
          <p class="muted">Run a request directly against this server.</p>

          <form id="explorer-form" class="grid">
            <div>
              <label for="api-key">API Key</label>
              <input id="api-key" name="api-key" value="test-builder-key-67890" />
            </div>
            <div>
              <label for="endpoint">Endpoint</label>
              <select id="endpoint" name="endpoint">
                <option value="top-yields">GET /v1/yields/top</option>
                <option value="protocols">GET /v1/protocols</option>
                <option value="token-search">GET /v1/tokens/search?q=ETH</option>
                <option value="il">GET /v1/tools/impermanent-loss</option>
                <option value="simulate-il">POST /v1/tools/impermanent-loss/simulate</option>
                <option value="chain-tvl">GET /v1/chains/ethereum/tvl</option>
              </select>
            </div>
            <div>
              <label for="payload">Body (for POST endpoints)</label>
              <textarea id="payload" name="payload"></textarea>
            </div>
            <button class="button" type="submit">Send Request</button>
          </form>

          <div class="response">
            <div id="response-status" class="response-status">Ready</div>
            <pre id="response-body" class="mono">{}</pre>
          </div>
        </article>

        <article class="card">
          <h3 class="card-title">MVP Coverage</h3>
          <p class="muted">Implemented API surface includes:</p>
          <ul>
            <li>Yield and APY endpoints with historical windows</li>
            <li>Protocol and chain-level TVL views</li>
            <li>Token metadata and price history endpoints</li>
            <li>Impermanent loss tooling with simulation</li>
            <li>Tier-aware auth, quotas, and webhook management</li>
          </ul>
          <p class="muted">
            Explore full schemas in <a class="accent" href="/docs">OpenAPI Docs</a>.
          </p>
        </article>
      </section>

      <footer class="footer">Base URL: <span class="accent">${baseApiUrl}</span></footer>
    </main>

    <script>
      const endpoints = {
        'top-yields': {
          method: 'GET',
          path: '/v1/yields/top',
        },
        protocols: {
          method: 'GET',
          path: '/v1/protocols',
        },
        'token-search': {
          method: 'GET',
          path: '/v1/tokens/search?q=ETH',
        },
        il: {
          method: 'GET',
          path: '/v1/tools/impermanent-loss?token0=ETH&token1=USDC&entry_price_ratio=2000&current_price_ratio=2500',
        },
        'simulate-il': {
          method: 'POST',
          path: '/v1/tools/impermanent-loss/simulate',
        },
        'chain-tvl': {
          method: 'GET',
          path: '/v1/chains/ethereum/tvl',
        },
      };
      const postPayloadTemplates = {
        'simulate-il': {
          token0: 'ETH',
          token1: 'USDC',
          entry_price_ratio: 2000,
          price_changes: [-0.5, -0.25, 0, 0.25, 0.5],
          fee_apr: 12,
          days: 30,
        },
      };

      const form = document.getElementById('explorer-form');
      const endpointSelect = document.getElementById('endpoint');
      const payloadInput = document.getElementById('payload');
      const statusEl = document.getElementById('response-status');
      const responseEl = document.getElementById('response-body');

      function updatePayloadPlaceholder() {
        const config = endpoints[endpointSelect.value];
        payloadInput.value = config.method === 'POST'
          ? JSON.stringify(postPayloadTemplates[endpointSelect.value] || {}, null, 2)
          : '';
      }

      endpointSelect.addEventListener('change', updatePayloadPlaceholder);
      updatePayloadPlaceholder();

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const apiKey = document.getElementById('api-key').value.trim();
        const endpoint = endpoints[endpointSelect.value];
        const url = new URL(endpoint.path, window.location.origin);
        const headers = {
          'x-api-key': apiKey,
        };

        const init = {
          method: endpoint.method,
          headers,
        };

        if (endpoint.method === 'POST' && payloadInput.value.trim()) {
          let parsedPayload;
          try {
            parsedPayload = JSON.parse(payloadInput.value);
          } catch {
            statusEl.textContent = 'Invalid JSON body';
            return;
          }

          headers['content-type'] = 'application/json';
          init.body = JSON.stringify(parsedPayload);
        }

        statusEl.textContent = 'Requesting...';

        try {
          const response = await fetch(url.toString(), init);
          const text = await response.text();
          let parsed;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { raw: text };
          }

          statusEl.textContent = endpoint.method + ' ' + endpoint.path + ' -> ' + response.status;
          responseEl.textContent = JSON.stringify(parsed, null, 2);
        } catch (error) {
          statusEl.textContent = 'Request failed';
          responseEl.textContent = JSON.stringify({ error: String(error) }, null, 2);
        }
      });
    </script>
  </body>
</html>`;
}

export default async function homeRoutes(fastify: FastifyInstance): Promise<void> {
  const projectRoot = process.cwd();
  const tokens = resolveHomeDesignTokens(projectRoot);

  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const hostHeader = typeof request.headers.host === 'string'
      ? request.headers.host.trim()
      : '';
    const origin = hostHeader
      ? `${request.protocol}://${hostHeader}`
      : `${request.protocol}://${request.hostname}`;

    void reply
      .type('text/html; charset=utf-8')
      .send(renderHomePage(origin, tokens));
  });
}
