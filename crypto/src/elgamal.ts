/**
 * ElGamal encryption over the Stark curve.
 *
 * Scheme (exponential ElGamal for additive homomorphism):
 *
 *   KeyGen:
 *     sk ← random scalar in [1, n-1]
 *     PK = sk * G
 *
 *   Encrypt(m, PK):
 *     r  ← random scalar
 *     C1 = r * G
 *     C2 = m * G + r * PK
 *     return (C1, C2)
 *
 *   Decrypt(C1, C2, sk):
 *     M  = C2 - sk * C1         // = m * G
 *     m  = dlog(M)              // brute-force for small m
 *
 *   Homomorphic add:
 *     Enc(a) + Enc(b) = (C1_a + C1_b, C2_a + C2_b) = Enc(a + b)
 */

import { utils } from "@scure/starknet";
import {
  G,
  ZERO,
  CURVE_ORDER,
  scalarMulG,
  scalarMul,
  pointAdd,
  pointSub,
  toAffine,
  isZero,
  mod,
  type ProjectivePoint,
} from "./curve";

// ────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────

export interface KeyPair {
  privateKey: bigint;
  publicKey: ProjectivePoint;
}

export interface Ciphertext {
  c1: ProjectivePoint; // r * G
  c2: ProjectivePoint; // m * G + r * PK
}

/** Serialized ciphertext with affine coordinates (for on-chain submission). */
export interface SerializedCiphertext {
  c1_x: bigint;
  c1_y: bigint;
  c2_x: bigint;
  c2_y: bigint;
}

// ────────────────────────────────────────────
//  Key generation
// ────────────────────────────────────────────

/** Generate a random ElGamal keypair. */
export function generateKeyPair(): KeyPair {
  const privateKey = randomScalar();
  const publicKey = scalarMulG(privateKey);
  return { privateKey, publicKey };
}

/** Derive the public key from a private key. */
export function derivePublicKey(privateKey: bigint): ProjectivePoint {
  return scalarMulG(privateKey);
}

// ────────────────────────────────────────────
//  Encryption
// ────────────────────────────────────────────

/** Encrypt a plaintext amount under the given public key. */
export function encrypt(amount: bigint, publicKey: ProjectivePoint): { ct: Ciphertext; r: bigint } {
  if (amount < 0n) throw new Error("Amount must be non-negative");

  const r = randomScalar();
  const c1 = scalarMulG(r);             // r * G
  const mG = amount === 0n ? ZERO : scalarMulG(amount); // m * G
  const rPK = scalarMul(publicKey, r);   // r * PK
  const c2 = pointAdd(mG, rPK);         // m * G + r * PK

  return { ct: { c1, c2 }, r };
}

/** Encrypt with a specific randomness (for deterministic tests). */
export function encryptWithRandomness(
  amount: bigint,
  publicKey: ProjectivePoint,
  r: bigint,
): Ciphertext {
  const c1 = scalarMulG(r);
  const mG = amount === 0n ? ZERO : scalarMulG(amount);
  const rPK = scalarMul(publicKey, r);
  const c2 = pointAdd(mG, rPK);
  return { c1, c2 };
}

// ────────────────────────────────────────────
//  Decryption
// ────────────────────────────────────────────

/**
 * Decrypt a ciphertext to recover the plaintext amount.
 *
 * Uses baby-step giant-step for bounded amounts (practical up to ~2^40).
 *
 * @param ct        - The ciphertext to decrypt.
 * @param sk        - The private key.
 * @param maxAmount - Maximum expected amount (default 2^32).
 * @returns The decrypted amount, or null if not found within range.
 */
export function decrypt(
  ct: Ciphertext,
  sk: bigint,
  maxAmount: bigint = 1n << 32n,
): bigint | null {
  // M = C2 - sk * C1 = m * G
  const skC1 = scalarMul(ct.c1, sk);
  const mG = pointSub(ct.c2, skC1);

  if (isZero(mG)) return 0n;

  return babyStepGiantStep(mG, maxAmount);
}

/**
 * Baby-step giant-step discrete log solver.
 * Finds m such that m * G = target, for m in [0, maxAmount].
 */
function babyStepGiantStep(target: ProjectivePoint, maxAmount: bigint): bigint | null {
  const m = sqrt(maxAmount) + 1n;

  // Baby step: compute table of j * G for j in [0, m)
  const table = new Map<string, bigint>();
  let current = ZERO;
  for (let j = 0n; j < m; j++) {
    const key = pointKey(current);
    table.set(key, j);
    current = pointAdd(current, G);
  }

  // Giant step: compute target - i * (m * G) for i in [0, m)
  const mG = scalarMulG(m);
  let gamma = target;
  for (let i = 0n; i < m; i++) {
    const key = pointKey(gamma);
    const j = table.get(key);
    if (j !== undefined) {
      return i * m + j;
    }
    gamma = pointSub(gamma, mG);
  }

  return null;
}

// ────────────────────────────────────────────
//  Serialization
// ────────────────────────────────────────────

/** Serialize a ciphertext to affine coordinates for on-chain submission. */
export function serializeCiphertext(ct: Ciphertext): SerializedCiphertext {
  if (isZero(ct.c1) && isZero(ct.c2)) {
    return { c1_x: 0n, c1_y: 0n, c2_x: 0n, c2_y: 0n };
  }

  const c1Aff = isZero(ct.c1) ? { x: 0n, y: 0n } : toAffine(ct.c1);
  const c2Aff = isZero(ct.c2) ? { x: 0n, y: 0n } : toAffine(ct.c2);

  return {
    c1_x: c1Aff.x,
    c1_y: c1Aff.y,
    c2_x: c2Aff.x,
    c2_y: c2Aff.y,
  };
}

/** The zero ciphertext (encrypts 0 with r=0). */
export function zeroCiphertext(): Ciphertext {
  return { c1: ZERO, c2: ZERO };
}

// ────────────────────────────────────────────
//  Internal helpers
// ────────────────────────────────────────────

/** Generate a random scalar in [1, n-1]. */
function randomScalar(): bigint {
  // Use crypto.getRandomValues for 32 bytes, reduce mod n.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let scalar = 0n;
  for (const b of bytes) {
    scalar = (scalar << 8n) | BigInt(b);
  }
  scalar = mod(scalar);
  // Ensure non-zero.
  return scalar === 0n ? 1n : scalar;
}

/** Integer square root (floor). */
function sqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("Negative input");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** Create a string key from a point for Map lookups. */
function pointKey(p: ProjectivePoint): string {
  if (isZero(p)) return "O";
  const aff = toAffine(p);
  return aff.x.toString(16);
}
