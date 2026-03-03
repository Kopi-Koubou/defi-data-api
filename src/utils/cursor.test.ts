import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, getPaginationParams } from './cursor.js';

describe('cursor utils', () => {
  it('encodes and decodes cursor payloads', () => {
    const cursor = encodeCursor({ offset: 40, chain: 'ethereum' });
    const decoded = decodeCursor(cursor);

    expect(decoded).toEqual({ offset: 40, chain: 'ethereum' });
  });

  it('returns null when cursor is invalid', () => {
    expect(decodeCursor('not-base64')).toBeNull();
  });

  it('normalizes pagination params', () => {
    const cursor = encodeCursor({ offset: 20 });
    const { decodedCursor, safeLimit } = getPaginationParams(cursor, 250, 100);

    expect(decodedCursor).toEqual({ offset: 20 });
    expect(safeLimit).toBe(100);
  });
});
