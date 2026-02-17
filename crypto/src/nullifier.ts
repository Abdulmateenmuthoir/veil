/**
 * Nullifier generation for double-spend prevention.
 *
 * A nullifier is a deterministic hash derived from:
 *   - The user's private key (ensures only the owner can generate it)
 *   - A unique nonce or transaction identifier
 *
 * Once a nullifier is submitted on-chain, the contract marks it as spent.
 * Any attempt to reuse it will be rejected.
 *
 * We use Pedersen hash (Stark-native) for compatibility with on-chain verification.
 */

import { pedersen } from "@scure/starknet";

/** Wrap pedersen to return bigint. */
function pedersenBigInt(a: bigint, b: bigint): bigint {
  return BigInt(pedersen(a, b));
}

/**
 * Generate a nullifier for a transfer or withdrawal.
 *
 * @param privateKey - The user's ElGamal private key.
 * @param nonce      - A unique nonce (e.g., incrementing counter or random).
 * @returns A felt252-compatible nullifier.
 */
export function generateNullifier(privateKey: bigint, nonce: bigint): bigint {
  return pedersenBigInt(privateKey, nonce);
}

/**
 * Generate a nullifier with domain separation for different operations.
 *
 * @param privateKey - The user's ElGamal private key.
 * @param nonce      - Unique nonce.
 * @param domain     - Operation type: "transfer" | "withdraw".
 * @returns A felt252-compatible nullifier.
 */
export function generateDomainNullifier(
  privateKey: bigint,
  nonce: bigint,
  domain: "transfer" | "withdraw",
): bigint {
  const domainTag = domain === "transfer" ? 1n : 2n;
  const inner = pedersenBigInt(privateKey, nonce);
  return pedersenBigInt(inner, domainTag);
}

/**
 * Generate a sequential nonce from a counter.
 * The user should persist this counter across sessions.
 */
export function nonceFromCounter(counter: number): bigint {
  return BigInt(counter);
}

/**
 * Generate a random nonce.
 */
export function randomNonce(): bigint {
  const bytes = new Uint8Array(31); // < 252 bits to fit in felt252
  crypto.getRandomValues(bytes);
  let nonce = 0n;
  for (const b of bytes) {
    nonce = (nonce << 8n) | BigInt(b);
  }
  return nonce;
}
