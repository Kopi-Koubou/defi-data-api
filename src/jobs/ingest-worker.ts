import 'dotenv/config';
import { runDefiLlamaIngestion } from '../ingestion/defillama.js';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

const intervalMs = parsePositiveInt(process.env.INGEST_INTERVAL_MS, 30_000);
const backfillOnStart = process.env.INGEST_BACKFILL_ON_START === 'true';
const backfillDays = parsePositiveInt(process.env.INGEST_BACKFILL_DAYS, 0);
const maxBackfillPools = parsePositiveInt(process.env.INGEST_MAX_BACKFILL_POOLS, 25);

let running = false;
let backfillCompleted = false;
let timer: NodeJS.Timeout | undefined;

async function runCycle(): Promise<void> {
  if (running) {
    console.warn('[ingest:worker] skipping tick because previous run is still in progress');
    return;
  }

  running = true;

  try {
    const shouldBackfill = backfillOnStart && !backfillCompleted;
    const summary = await runDefiLlamaIngestion({
      backfillDays: shouldBackfill ? backfillDays : 0,
      maxBackfillPools,
    });

    if (shouldBackfill) {
      backfillCompleted = true;
    }

    console.log('[ingest:worker] cycle complete');
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.error('[ingest:worker] cycle failed');
    console.error(error);
  } finally {
    running = false;
  }
}

function shutdown(signal: string): void {
  console.log(`[ingest:worker] received ${signal}, shutting down`);
  if (timer) {
    clearInterval(timer);
  }
  process.exit(0);
}

async function main(): Promise<void> {
  console.log(`[ingest:worker] starting, interval=${intervalMs}ms`);
  await runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

void main();

