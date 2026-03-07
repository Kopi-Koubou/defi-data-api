import { buildServer } from '../dist/index.js';

let fastifyPromise = null;

async function getFastify() {
  if (!fastifyPromise) {
    fastifyPromise = buildServer();
  }
  return fastifyPromise;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      resolve(body || undefined);
    });

    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  try {
    const server = await getFastify();
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await collectBody(req);

    const response = await server.inject({
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers,
      payload: body,
    });

    res.statusCode = response.statusCode;

    Object.entries(response.headers).forEach(([key, value]) => {
      if (value === undefined) return;
      if (Array.isArray(value)) {
        res.setHeader(key, value);
      } else {
        res.setHeader(key, String(value));
      }
    });

    res.end(response.body);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain');
    res.end(`Internal server error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}
