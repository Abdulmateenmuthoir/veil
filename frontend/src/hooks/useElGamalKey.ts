"use client";

import { useState, useEffect, useCallback } from "react";
import { Point, pedersen } from "@scure/starknet";
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

const CURVE_ORDER =
  0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;

/**
 * Fixed typed data signed once to derive the ElGamal key.
 * The same wallet always produces the same signature → same key.
 * Keys are fully recoverable from the wallet seed phrase on any device.
 * This signature is NEVER submitted on-chain.
 */
const DERIVATION_TYPED_DATA = {
  types: {
    StarknetDomain: [
      { name: "name", type: "shortstring" },
      { name: "version", type: "shortstring" },
      { name: "chainId", type: "shortstring" },
      { name: "revision", type: "shortstring" },
    ],
    VeilKeyDerivation: [
      { name: "intent", type: "shortstring" },
    ],
  },
  primaryType: "VeilKeyDerivation",
  domain: {
    name: "Veil",
    version: "1",
    chainId: "SN_SEPOLIA",
    revision: "1",
  },
  message: {
    intent: "veil_key_v1",
  },
};

export function useElGamalKey() {
  const [keys, setKeys] = useState<ElGamalKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [deriving, setDeriving] = useState(false);
  const [deriveError, setDeriveError] = useState<string | null>(null);

  // Load cached keys from localStorage on mount.
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
      localStorage.removeItem(LS_ELGAMAL_PRIVATE_KEY);
      localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_X);
      localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_Y);
    }
    setLoading(false);
  }, []);

  /**
   * Derive a deterministic ElGamal keypair from a one-time wallet signature.
   *
   * The wallet signs a fixed typed-data message. The signature is hashed via
   * Pedersen to produce a scalar, which becomes the ElGamal private key.
   * Same wallet → same signature → same key — always recoverable.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deriveKeys = useCallback(async (account: any) => {
    setDeriving(true);
    setDeriveError(null);
    try {
      // One-time wallet signature — never submitted on-chain.
      const sig: string[] = await account.signMessage(DERIVATION_TYPED_DATA);

      // Pedersen-hash all signature elements into a single seed.
      let seed = BigInt(sig[0]);
      for (let i = 1; i < sig.length; i++) {
        seed = BigInt(pedersen(seed, BigInt(sig[i])));
      }
      let sk = seed % CURVE_ORDER;
      if (sk === 0n) sk = 1n;

      const publicKeyPoint = Point.BASE.multiply(sk);
      const aff = publicKeyPoint.toAffine();

      // Cache in localStorage — avoids re-signing on every page load.
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Signature rejected";
      setDeriveError(msg);
      throw err;
    } finally {
      setDeriving(false);
    }
  }, []);

  // Clear cached keys (e.g. when re-registering).
  const clearKeys = useCallback(() => {
    localStorage.removeItem(LS_ELGAMAL_PRIVATE_KEY);
    localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_X);
    localStorage.removeItem(LS_ELGAMAL_PUBLIC_KEY_Y);
    setKeys(null);
  }, []);

  return { keys, loading, deriving, deriveError, deriveKeys, clearKeys };
}
