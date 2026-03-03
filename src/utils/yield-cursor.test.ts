import { describe, expect, it } from 'vitest';

import { decodeYieldCursor, encodeYieldCursor } from './yield-cursor.js';

describe('yield-cursor utils', () => {
  it('encodes and decodes valid yield cursors', () => {
    const encoded = encodeYieldCursor({
      sortBy: 'apy',
      sortValue: 12.3456,
      poolId: 'pool-123',
    });

    const decoded = decodeYieldCursor(encoded, 'apy');

    expect(decoded).toEqual({
      sortBy: 'apy',
      sortValue: 12.3456,
      poolId: 'pool-123',
    });
  });

  it('rejects cursors with sort mismatch', () => {
    const encoded = encodeYieldCursor({
      sortBy: 'tvl',
      sortValue: 1000000,
      poolId: 'pool-abc',
    });

    expect(decodeYieldCursor(encoded, 'apy')).toBeNull();
  });

  it('rejects malformed cursor payloads', () => {
    expect(decodeYieldCursor('not-a-cursor', 'apy')).toBeNull();
  });
});
