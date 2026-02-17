"use client";

import { useState, useEffect, useCallback } from "react";
import { Point } from "@scure/starknet";
import {
  LS_ELGAMAL_PRIVATE_KEY,
  LS_ELGAMAL_PUBLIC_KEY_X,
  LS_ELGAMAL_PUBLIC_KEY_Y,
} from "@/lib/constants";

export interface ElGamalKeys {
  privateKey: bigint;
  publicKey: { x: bigint; y: bigint };
  publicKeyPoint: InstanceType<typeof Point>;
}

/**
 * Manages the user's client-side ElGamal keypair.
 * Keys are persisted in localStorage so they survive page reloads.
 */
export function useElGamalKey() {
  const [keys, setKeys] = useState<ElGamalKeys | null>(null);
  const [loading, setLoading] = useState(true);

  // Load from localStorage on mount.
  useEffect(() => {
    try {
      const skStr = localStorage.getItem(LS_ELGAMAL_PRIVATE_KEY);
      const pkxStr = localStorage.getItem(LS_ELGAMAL_PUBLIC_KEY_X);
      const pkyStr = localStorage.getItem(LS_ELGAMAL_PUBLIC_KEY_Y);

      if (skStr && pkxStr && pkyStr) {
        const privateKey = BigInt(skStr);
        const x = BigInt(pkxStr);
        const y = BigInt(pkyStr);
        const publicKeyPoint = Point.fromAffine({ x, y });
        setKeys({ privateKey, publicKey: { x, y }, publicKeyPoint });
      }
    } catch {
      // Corrupt data — clear.
      localStorage.removeItem(LS_ELGAMAL_PRIVATE_KEY);
      localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_X);
      localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_Y);
    }
    setLoading(false);
  }, []);

  // Generate a new keypair.
  const generateKeys = useCallback(() => {
    // Random scalar in [1, n-1].
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const CURVE_ORDER =
      0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;
    let sk = 0n;
    for (const b of bytes) sk = (sk << 8n) | BigInt(b);
    sk = sk % CURVE_ORDER;
    if (sk === 0n) sk = 1n;

    const publicKeyPoint = Point.BASE.multiply(sk);
    const aff = publicKeyPoint.toAffine();

    // Persist.
    localStorage.setItem(LS_ELGAMAL_PRIVATE_KEY, sk.toString());
    localStorage.setItem(LS_ELGAMAL_PUBLIC_KEY_X, aff.x.toString());
    localStorage.setItem(LS_ELGAMAL_PUBLIC_KEY_Y, aff.y.toString());

    const newKeys: ElGamalKeys = {
      privateKey: sk,
      publicKey: { x: aff.x, y: aff.y },
      publicKeyPoint,
    };
    setKeys(newKeys);
    return newKeys;
  }, []);

  // Clear keys.
  const clearKeys = useCallback(() => {
    localStorage.removeItem(LS_ELGAMAL_PRIVATE_KEY);
    localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_X);
    localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_Y);
    setKeys(null);
  }, []);

  return { keys, loading, generateKeys, clearKeys };
}
