import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

function renderHomePage(origin: string): string {
  const baseApiUrl = `${origin}/v1`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>DeFi Data API</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" rel="stylesheet" />
    <style>
      :root {
        --color-bg: #f8f7f4;
        --color-surface: #fffdfa;
        --color-text: #1c1a17;
        --color-text-muted: #6d675f;
        --color-border: #e7e1d8;
        --color-accent: #c96b3c;
        --color-accent-soft: #f3e8e0;
        --font-heading: 'Source Serif 4', Georgia, serif;
        --font-body: 'DM Sans', system-ui, sans-serif;
        --space-1: 4px;
        --space-2: 8px;
        --space-3: 12px;
        --space-4: 16px;
        --space-6: 24px;
        --space-8: 32px;
        --space-12: 48px;
        --space-16: 64px;
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
      }

      .link:hover {
        border-color: var(--color-accent);
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
        background: #f4f0ea;
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
        background: #fffdf9;
        color: var(--color-text);
        padding: var(--space-3);
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
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }

      .button {
        min-height: 44px;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 0 var(--space-4);
        background: var(--color-accent);
        color: #fffdfa;
        font-weight: 600;
        cursor: pointer;
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
    </style>
  </head>
  <body>
    <main class="layout">
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
        'chain-tvl': {
          method: 'GET',
          path: '/v1/chains/ethereum/tvl',
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
          ? JSON.stringify({ example: true }, null, 2)
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
          headers['content-type'] = 'application/json';
          init.body = payloadInput.value;
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
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = `${request.protocol}://${request.hostname}`;
    void reply
      .type('text/html; charset=utf-8')
      .send(renderHomePage(origin));
  });
}
