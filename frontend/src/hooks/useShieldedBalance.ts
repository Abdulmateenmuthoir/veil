"use client";

import { useState, useCallback, useEffect } from "react";
import { Point } from "@scure/starknet";
import type { ElGamalKeys } from "./useElGamalKey";

const ZERO = Point.ZERO;
const G = Point.BASE;
const CURVE_ORDER =
  0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;

// STRK has 18 decimals. Encrypting raw wei is impossible for BSGS (max ~2^32).
// We encode balances in gwei (10^9 wei) so BSGS handles up to ~68 STRK (2^36).
const BALANCE_SCALE = 10n ** 9n;
const BSGS_MAX = 1n << 36n;

function mod(n: bigint): bigint {
  const r = n % CURVE_ORDER;
  return r < 0n ? r + CURVE_ORDER : r;
}

interface Ciphertext {
  c1: InstanceType<typeof Point>;
  c2: InstanceType<typeof Point>;
}

// ── Module-level BSGS table cache ──────────────────────────────────────────
//
// The baby-step table only depends on G (constant) and m (derived from
// BSGS_MAX, also constant). Building it once and reusing makes every
// decryption after the first essentially free.

let _bsgsTable: Map<string, bigint> | null = null;
let _bsgsM: bigint = 0n;
let _bsgsMG: InstanceType<typeof Point> | null = null;

function buildBsgsTable(): void {
  if (_bsgsTable) return; // already built
  const m = isqrt(BSGS_MAX) + 1n;
  const table = new Map<string, bigint>();
  let current: InstanceType<typeof Point> = ZERO;
  for (let j = 0n; j < m; j++) {
    table.set(pointKey(current), j);
    current = current.add(G);
  }
  _bsgsTable = table;
  _bsgsM = m;
  _bsgsMG = G.multiply(m);
}

function babyStepGiantStep(
  target: InstanceType<typeof Point>,
): bigint | null {
  // Build table synchronously if not yet ready (first call only).
  if (!_bsgsTable) buildBsgsTable();
  const table = _bsgsTable!;
  const m = _bsgsM;
  const mG = _bsgsMG!;

  let gamma = target;
  for (let i = 0n; i < m; i++) {
    const j = table.get(pointKey(gamma));
    if (j !== undefined) return i * m + j;
    gamma = gamma.add(mG.negate());
  }
  return null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * Manages client-side encrypted balance state.
 * Provides encrypt/decrypt/update operations.
 */
export function useShieldedBalance(keys: ElGamalKeys | null) {
  const [encryptedBalance, setEncryptedBalance] = useState<Ciphertext>({
    c1: ZERO,
    c2: ZERO,
  });
  const [decryptedBalance, setDecryptedBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  // Kick off table precomputation as soon as possible so it is ready
  // by the time the user connects their wallet.
  useEffect(() => {
    if (_bsgsTable) return;
    const id = setTimeout(buildBsgsTable, 0);
    return () => clearTimeout(id);
  }, []);

  // Encrypt an amount (in wei) under the user's public key.
  // Internally encodes as gwei (amount / BALANCE_SCALE) so BSGS can decrypt.
  const encryptAmount = useCallback(
    (amountWei: bigint) => {
      if (!keys) throw new Error("No keys");
      const r = randomScalar();
      const c1 = G.multiply(r);
      const amountGwei = amountWei / BALANCE_SCALE;
      const mG = amountGwei === 0n ? ZERO : G.multiply(amountGwei);
      const rPK = keys.publicKeyPoint.multiply(r);
      const c2 = mG.add(rPK);
      return { c1, c2 };
    },
    [keys],
  );

  // Decrypt a ciphertext → gwei, then scale to wei.
  const decryptBalance = useCallback(
    (ct: Ciphertext): bigint | null => {
      if (!keys) return null;
      const skC1 = ct.c1.equals(ZERO) ? ZERO : ct.c1.multiply(keys.privateKey);
      const mG = ct.c2.add(skC1.negate());
      if (mG.equals(ZERO)) return 0n;
      return babyStepGiantStep(mG);
    },
    [keys],
  );

  // Compute new balance after deposit.
  const computeDeposit = useCallback(
    (amount: bigint) => {
      if (!keys) throw new Error("No keys");
      const encAmount = encryptAmount(amount);
      const newBal: Ciphertext = {
        c1: encryptedBalance.c1.add(encAmount.c1),
        c2: encryptedBalance.c2.add(encAmount.c2),
      };
      return {
        newBalance: newBal,
        serialized: serializeCt(newBal),
      };
    },
    [keys, encryptedBalance, encryptAmount],
  );

  // Compute new balances after transfer.
  // recipientCurrentBal is the recipient's current on-chain encrypted balance.
  const computeTransfer = useCallback(
    (
      amount: bigint,
      recipientPkX: bigint,
      recipientPkY: bigint,
      recipientCurrentBal?: { c1x: bigint; c1y: bigint; c2x: bigint; c2y: bigint },
    ) => {
      if (!keys) throw new Error("No keys");
      const recipientPK = Point.fromAffine({ x: recipientPkX, y: recipientPkY });

      // Sender side: subtract amount.
      const senderEnc = encryptAmount(amount);
      const newSenderBal: Ciphertext = {
        c1: encryptedBalance.c1.add(senderEnc.c1.negate()),
        c2: encryptedBalance.c2.add(senderEnc.c2.negate()),
      };

      // Recipient side: encrypt amount under their key.
      const r = randomScalar();
      const recipientC1 = G.multiply(r);
      const amountGwei = amount / BALANCE_SCALE;
      const mG = amountGwei === 0n ? ZERO : G.multiply(amountGwei);
      const rPK = recipientPK.multiply(r);
      const recipientC2 = mG.add(rPK);

      // Add to recipient's existing on-chain balance if available.
      let finalRecipientC1 = recipientC1;
      let finalRecipientC2 = recipientC2;
      if (recipientCurrentBal) {
        const isZero =
          recipientCurrentBal.c1x === 0n &&
          recipientCurrentBal.c1y === 0n &&
          recipientCurrentBal.c2x === 0n &&
          recipientCurrentBal.c2y === 0n;
        if (!isZero) {
          const existC1 = Point.fromAffine({
            x: recipientCurrentBal.c1x,
            y: recipientCurrentBal.c1y,
          });
          const existC2 = Point.fromAffine({
            x: recipientCurrentBal.c2x,
            y: recipientCurrentBal.c2y,
          });
          finalRecipientC1 = existC1.add(recipientC1);
          finalRecipientC2 = existC2.add(recipientC2);
        }
      }

      return {
        newSenderBalance: newSenderBal,
        senderSerialized: serializeCt(newSenderBal),
        recipientSerialized: serializeCt({
          c1: finalRecipientC1,
          c2: finalRecipientC2,
        }),
      };
    },
    [keys, encryptedBalance, encryptAmount],
  );

  // Compute new balance after withdrawal.
  const computeWithdraw = useCallback(
    (amount: bigint) => {
      if (!keys) throw new Error("No keys");
      const encAmount = encryptAmount(amount);
      const newBal: Ciphertext = {
        c1: encryptedBalance.c1.add(encAmount.c1.negate()),
        c2: encryptedBalance.c2.add(encAmount.c2.negate()),
      };
      return {
        newBalance: newBal,
        serialized: serializeCt(newBal),
      };
    },
    [keys, encryptedBalance, encryptAmount],
  );

  // Update local state from on-chain ciphertext.
  // Returns a Promise resolving to the newly decrypted balance (in wei).
  // Uses setTimeout(0) so React renders the loading spinner before BSGS runs.
  const syncFromChain = useCallback(
    (c1x: bigint, c1y: bigint, c2x: bigint, c2y: bigint): Promise<bigint> => {
      setLoading(true);
      const isZeroCt = c1x === 0n && c1y === 0n && c2x === 0n && c2y === 0n;
      const ct: Ciphertext = isZeroCt
        ? { c1: ZERO, c2: ZERO }
        : {
            c1: Point.fromAffine({ x: c1x, y: c1y }),
            c2: Point.fromAffine({ x: c2x, y: c2y }),
          };
      setEncryptedBalance(ct);

      return new Promise<bigint>((resolve) => {
        setTimeout(() => {
          try {
            // After first call the table is cached: subsequent runs are instant.
            const dec = decryptBalance(ct);
            const newBal = dec !== null ? dec * BALANCE_SCALE : 0n;
            setDecryptedBalance(newBal);
            resolve(newBal);
          } finally {
            setLoading(false);
          }
        }, 0);
      });
    },
    [decryptBalance],
  );

  // Update after a local operation (deposit/transfer/withdraw).
  // Returns the new decrypted balance so callers can detect incoming transfers.
  const updateLocal = useCallback(
    (newCt: Ciphertext): bigint => {
      setEncryptedBalance(newCt);
      const dec = decryptBalance(newCt);
      const newBal = dec !== null ? dec * BALANCE_SCALE : 0n;
      setDecryptedBalance(newBal);
      return newBal;
    },
    [decryptBalance],
  );

  return {
    encryptedBalance,
    decryptedBalance,
    loading,
    encryptAmount,
    computeDeposit,
    computeTransfer,
    computeWithdraw,
    syncFromChain,
    updateLocal,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomScalar(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = 0n;
  for (const b of bytes) s = (s << 8n) | BigInt(b);
  s = mod(s);
  return s === 0n ? 1n : s;
}

function serializeCt(ct: Ciphertext) {
  const isC1Zero = ct.c1.equals(ZERO);
  const isC2Zero = ct.c2.equals(ZERO);
  const c1 = isC1Zero ? { x: 0n, y: 0n } : ct.c1.toAffine();
  const c2 = isC2Zero ? { x: 0n, y: 0n } : ct.c2.toAffine();
  return { c1_x: c1.x, c1_y: c1.y, c2_x: c2.x, c2_y: c2.y };
}

function pointKey(p: InstanceType<typeof Point>): string {
  return p.equals(ZERO) ? "O" : p.toAffine().x.toString(16);
}

function isqrt(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}
