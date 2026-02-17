"use client";

import { useState, useCallback } from "react";
import { Point } from "@scure/starknet";
import type { ElGamalKeys } from "./useElGamalKey";

const ZERO = Point.ZERO;
const G = Point.BASE;
const CURVE_ORDER =
  0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;

function mod(n: bigint): bigint {
  const r = n % CURVE_ORDER;
  return r < 0n ? r + CURVE_ORDER : r;
}

interface Ciphertext {
  c1: InstanceType<typeof Point>;
  c2: InstanceType<typeof Point>;
}

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

  // Encrypt an amount under the user's public key.
  const encryptAmount = useCallback(
    (amount: bigint) => {
      if (!keys) throw new Error("No keys");
      const r = randomScalar();
      const c1 = G.multiply(r);
      const mG = amount === 0n ? ZERO : G.multiply(amount);
      const rPK = keys.publicKeyPoint.multiply(r);
      const c2 = mG.add(rPK);
      return { c1, c2 };
    },
    [keys],
  );

  // Decrypt the current encrypted balance.
  const decryptBalance = useCallback(
    (ct: Ciphertext, maxAmount: bigint = 1n << 32n): bigint | null => {
      if (!keys) return null;
      const skC1 = ct.c1.equals(ZERO) ? ZERO : ct.c1.multiply(keys.privateKey);
      const mG = ct.c2.add(skC1.negate());
      if (mG.equals(ZERO)) return 0n;
      return babyStepGiantStep(mG, maxAmount);
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
      const mG = G.multiply(amount);
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
  const syncFromChain = useCallback(
    (c1x: bigint, c1y: bigint, c2x: bigint, c2y: bigint) => {
      setLoading(true);
      try {
        const isZeroCt =
          c1x === 0n && c1y === 0n && c2x === 0n && c2y === 0n;
        const ct: Ciphertext = isZeroCt
          ? { c1: ZERO, c2: ZERO }
          : {
              c1: Point.fromAffine({ x: c1x, y: c1y }),
              c2: Point.fromAffine({ x: c2x, y: c2y }),
            };
        setEncryptedBalance(ct);

        const dec = decryptBalance(ct);
        setDecryptedBalance(dec ?? 0n);
      } finally {
        setLoading(false);
      }
    },
    [decryptBalance],
  );

  // Update after a local operation (deposit/transfer/withdraw).
  const updateLocal = useCallback(
    (newCt: Ciphertext) => {
      setEncryptedBalance(newCt);
      const dec = decryptBalance(newCt);
      setDecryptedBalance(dec ?? 0n);
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

// ── Helpers ──

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

function babyStepGiantStep(
  target: InstanceType<typeof Point>,
  maxAmount: bigint,
): bigint | null {
  const m = isqrt(maxAmount) + 1n;
  const table = new Map<string, bigint>();
  let current: InstanceType<typeof Point> = ZERO;

  for (let j = 0n; j < m; j++) {
    const key = current.equals(ZERO) ? "O" : current.toAffine().x.toString(16);
    table.set(key, j);
    current = current.add(G);
  }

  const mG = G.multiply(m);
  let gamma = target;
  for (let i = 0n; i < m; i++) {
    const key = gamma.equals(ZERO) ? "O" : gamma.toAffine().x.toString(16);
    const j = table.get(key);
    if (j !== undefined) return i * m + j;
    gamma = gamma.add(mG.negate());
  }

  return null;
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
