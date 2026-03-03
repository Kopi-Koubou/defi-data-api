import { decodeCursor, encodeCursor } from './cursor.js';

import type { YieldPaginationCursor } from '../types/index.js';

function parseSortValue(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number.parseFloat(value);
  }

  return Number.NaN;
}

export function encodeYieldCursor(cursor: YieldPaginationCursor): string {
  const payload = {
    sort_by: cursor.sortBy,
    sort_value: cursor.sortValue,
    pool_id: cursor.poolId,
  } satisfies Record<string, string | number | boolean | null>;

  return encodeCursor(payload);
}

export function decodeYieldCursor(
  cursor: string | undefined,
  expectedSortBy: 'apy' | 'tvl'
): YieldPaginationCursor | null {
  if (!cursor) {
    return null;
  }

  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return null;
  }

  const sortBy = decoded.sort_by;
  const poolId = decoded.pool_id;
  const sortValue = parseSortValue(decoded.sort_value);

  if ((sortBy !== 'apy' && sortBy !== 'tvl') || sortBy !== expectedSortBy) {
    return null;
  }

  if (!Number.isFinite(sortValue)) {
    return null;
  }

  if (typeof poolId !== 'string' || poolId.length === 0) {
    return null;
  }

  return {
    sortBy,
    sortValue,
    poolId,
  };
}
