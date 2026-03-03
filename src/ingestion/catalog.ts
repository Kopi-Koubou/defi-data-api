/**
 * DeFi ingestion catalog and normalization helpers.
 * Keeps protocol/chain mapping logic deterministic and testable.
 */

export type CorePoolType = 'lending' | 'lp' | 'staking' | 'vault' | 'restaking';

export interface CoreProtocolConfig {
  id: string;
  slug: string;
  name: string;
  category: string;
  url: string;
  auditStatus: 'audited' | 'partial' | 'unaudited' | 'unknown';
  poolType: CorePoolType;
}

export const CORE_PROTOCOLS = {
  'aave-v3': {
    id: 'aave-v3',
    slug: 'aave-v3',
    name: 'Aave V3',
    category: 'lending',
    url: 'https://aave.com',
    auditStatus: 'audited',
    poolType: 'lending',
  },
  'compound-v3': {
    id: 'compound-v3',
    slug: 'compound-v3',
    name: 'Compound V3',
    category: 'lending',
    url: 'https://compound.finance',
    auditStatus: 'audited',
    poolType: 'lending',
  },
  'uniswap-v3': {
    id: 'uniswap-v3',
    slug: 'uniswap-v3',
    name: 'Uniswap V3',
    category: 'dex',
    url: 'https://uniswap.org',
    auditStatus: 'audited',
    poolType: 'lp',
  },
  curve: {
    id: 'curve',
    slug: 'curve',
    name: 'Curve Finance',
    category: 'dex',
    url: 'https://curve.fi',
    auditStatus: 'audited',
    poolType: 'lp',
  },
  lido: {
    id: 'lido',
    slug: 'lido',
    name: 'Lido',
    category: 'liquid-staking',
    url: 'https://lido.fi',
    auditStatus: 'audited',
    poolType: 'staking',
  },
  maker: {
    id: 'maker',
    slug: 'maker',
    name: 'Maker',
    category: 'lending',
    url: 'https://makerdao.com',
    auditStatus: 'audited',
    poolType: 'lending',
  },
  yearn: {
    id: 'yearn',
    slug: 'yearn',
    name: 'Yearn Finance',
    category: 'yield-aggregator',
    url: 'https://yearn.fi',
    auditStatus: 'audited',
    poolType: 'vault',
  },
  pendle: {
    id: 'pendle',
    slug: 'pendle',
    name: 'Pendle',
    category: 'yield-trading',
    url: 'https://pendle.finance',
    auditStatus: 'audited',
    poolType: 'lp',
  },
  eigenlayer: {
    id: 'eigenlayer',
    slug: 'eigenlayer',
    name: 'EigenLayer',
    category: 'restaking',
    url: 'https://www.eigenlayer.xyz',
    auditStatus: 'audited',
    poolType: 'restaking',
  },
  jupiter: {
    id: 'jupiter',
    slug: 'jupiter',
    name: 'Jupiter',
    category: 'dex',
    url: 'https://jup.ag',
    auditStatus: 'audited',
    poolType: 'lp',
  },
  raydium: {
    id: 'raydium',
    slug: 'raydium',
    name: 'Raydium',
    category: 'dex',
    url: 'https://raydium.io',
    auditStatus: 'audited',
    poolType: 'lp',
  },
  marinade: {
    id: 'marinade',
    slug: 'marinade',
    name: 'Marinade',
    category: 'liquid-staking',
    url: 'https://marinade.finance',
    auditStatus: 'audited',
    poolType: 'staking',
  },
  morpho: {
    id: 'morpho',
    slug: 'morpho',
    name: 'Morpho',
    category: 'lending',
    url: 'https://morpho.org',
    auditStatus: 'audited',
    poolType: 'lending',
  },
  spark: {
    id: 'spark',
    slug: 'spark',
    name: 'Spark',
    category: 'lending',
    url: 'https://spark.fi',
    auditStatus: 'audited',
    poolType: 'lending',
  },
  ethena: {
    id: 'ethena',
    slug: 'ethena',
    name: 'Ethena',
    category: 'synthetic-stablecoin',
    url: 'https://www.ethena.fi',
    auditStatus: 'audited',
    poolType: 'staking',
  },
} as const satisfies Record<string, CoreProtocolConfig>;

export type CoreProtocolId = keyof typeof CORE_PROTOCOLS;

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
}

const PROTOCOL_ALIASES: Record<string, CoreProtocolId> = {
  aave: 'aave-v3',
  'aave-v3': 'aave-v3',
  compound: 'compound-v3',
  'compound-v3': 'compound-v3',
  uniswap: 'uniswap-v3',
  'uniswap-v3': 'uniswap-v3',
  curve: 'curve',
  lido: 'lido',
  maker: 'maker',
  makerdao: 'maker',
  yearn: 'yearn',
  'yearn-finance': 'yearn',
  pendle: 'pendle',
  eigenlayer: 'eigenlayer',
  'eigen-layer': 'eigenlayer',
  jupiter: 'jupiter',
  'jupiter-exchange': 'jupiter',
  raydium: 'raydium',
  marinade: 'marinade',
  'marinade-finance': 'marinade',
  morpho: 'morpho',
  'morpho-blue': 'morpho',
  spark: 'spark',
  'spark-protocol': 'spark',
  'spark-lend': 'spark',
  ethena: 'ethena',
  'ethena-labs': 'ethena',
};

const CHAIN_ALIASES: Record<string, string> = {
  ethereum: 'ethereum',
  eth: 'ethereum',
  arbitrum: 'arbitrum',
  'arbitrum-one': 'arbitrum',
  base: 'base',
  polygon: 'polygon',
  matic: 'polygon',
  'polygon-pos': 'polygon',
  solana: 'solana',
  sol: 'solana',
};

export const SUPPORTED_CHAINS = new Set(['ethereum', 'arbitrum', 'base', 'polygon', 'solana']);

export function normalizeProtocol(project: string): CoreProtocolId | null {
  return PROTOCOL_ALIASES[normalizeKey(project)] || null;
}

export function normalizeChain(chain: string): string | null {
  const normalized = CHAIN_ALIASES[normalizeKey(chain)];
  if (!normalized) {
    return null;
  }

  return SUPPORTED_CHAINS.has(normalized) ? normalized : null;
}
