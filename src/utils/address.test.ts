import { describe, expect, it } from 'vitest';

import { normalizeAddress } from './address.js';

describe('address utils', () => {
  it('normalizes EVM addresses to lowercase', () => {
    expect(normalizeAddress('0xA0b86991C6218B36C1d19D4A2E9eb0ce3606eb48')).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
    );
  });

  it('preserves case for non-EVM addresses', () => {
    expect(normalizeAddress('So11111111111111111111111111111111111111112')).toBe(
      'So11111111111111111111111111111111111111112'
    );
  });
});
