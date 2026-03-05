const EVM_ADDRESS_PREFIX = /^0x/i;

/**
 * Canonicalize token addresses for lookups:
 * - EVM addresses are case-insensitive, so normalize to lowercase.
 * - Non-EVM addresses (for example Solana) are case-sensitive, so preserve case.
 */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) {
    return trimmed;
  }

  return EVM_ADDRESS_PREFIX.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}
