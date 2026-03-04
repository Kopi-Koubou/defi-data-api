import { describe, expect, it } from 'vitest';

import { buildIlHistorySeries } from './il-history.js';

describe('buildIlHistorySeries', () => {
  it('returns empty result when no valid price points exist', () => {
    const series = buildIlHistorySeries('ETH', 'USDC', [
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        token0PriceUsd: 0,
        token1PriceUsd: 1,
      },
    ]);

    expect(series.entryPriceRatio).toBeNull();
    expect(series.points).toEqual([]);
  });

  it('computes IL points from sorted historical token prices', () => {
    const series = buildIlHistorySeries('ETH', 'USDC', [
      {
        timestamp: new Date('2026-01-03T00:00:00.000Z'),
        token0PriceUsd: 4000,
        token1PriceUsd: 1,
      },
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        token0PriceUsd: 2000,
        token1PriceUsd: 1,
      },
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        token0PriceUsd: 2500,
        token1PriceUsd: 1,
      },
    ]);

    expect(series.entryPriceRatio).toBe(2000);
    expect(series.points).toHaveLength(3);
    expect(series.points[0].timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(series.points[0].ilPercentage).toBe(0);
    expect(series.points[0].holdValueIndex).toBe(1);
    expect(series.points[0].lpValueIndex).toBe(1);

    expect(series.points[2].timestamp.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(series.points[2].priceRatio).toBe(4000);
    expect(series.points[2].ilPercentage).toBeCloseTo(-5.7191, 4);
    expect(series.points[2].holdValueIndex).toBe(1.5);
    expect(series.points[2].lpValueIndex).toBeCloseTo(1.414214, 6);
  });
});
