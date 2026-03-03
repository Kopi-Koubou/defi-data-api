import { describe, expect, it } from 'vitest';
import { CORE_PROTOCOLS, normalizeChain, normalizeProtocol } from './catalog.js';

describe('ingestion catalog', () => {
  it('includes full MVP protocol coverage', () => {
    expect(Object.keys(CORE_PROTOCOLS)).toHaveLength(15);
    expect(CORE_PROTOCOLS['aave-v3']).toBeDefined();
    expect(CORE_PROTOCOLS.ethena).toBeDefined();
    expect(CORE_PROTOCOLS.eigenlayer).toBeDefined();
  });

  it('normalizes protocol aliases from upstream names', () => {
    expect(normalizeProtocol('AAVE')).toBe('aave-v3');
    expect(normalizeProtocol('Compound')).toBe('compound-v3');
    expect(normalizeProtocol('MakerDAO')).toBe('maker');
    expect(normalizeProtocol('Yearn Finance')).toBe('yearn');
    expect(normalizeProtocol('Morpho_Blue')).toBe('morpho');
    expect(normalizeProtocol('unknown')).toBeNull();
  });

  it('normalizes supported chain aliases', () => {
    expect(normalizeChain('ETH')).toBe('ethereum');
    expect(normalizeChain('Arbitrum One')).toBe('arbitrum');
    expect(normalizeChain('Polygon POS')).toBe('polygon');
    expect(normalizeChain('SOL')).toBe('solana');
    expect(normalizeChain('avalanche')).toBeNull();
  });
});
