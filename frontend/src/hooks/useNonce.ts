"use client";

import { useState, useCallback, useEffect } from "react";
import { pedersen } from "@scure/starknet";
import { LS_NONCE_COUNTER } from "@/lib/constants";

/**
 * Manages the nonce counter for nullifier generation.
 * Persisted in localStorage, scoped per wallet address.
 *
 * @param accountAddress - The connected wallet address.
 */
export function useNonce(accountAddress?: string) {
  const [counter, setCounter] = useState(0);

  const lsKey = accountAddress
    ? `${LS_NONCE_COUNTER}_${accountAddress}`
    : LS_NONCE_COUNTER;

  useEffect(() => {
    if (!accountAddress) {
      setCounter(0);
      return;
    }
    const stored = localStorage.getItem(lsKey);
    if (stored) setCounter(parseInt(stored, 10));
    else setCounter(0);
  }, [lsKey, accountAddress]);

  const nextNullifier = useCallback(
    (privateKey: bigint, domain: "transfer" | "withdraw"): bigint => {
      const newCounter = counter + 1;
      setCounter(newCounter);
      localStorage.setItem(lsKey, newCounter.toString());

      const domainTag = domain === "transfer" ? 1n : 2n;
      const inner = BigInt(pedersen(privateKey, BigInt(newCounter)));
      return BigInt(pedersen(inner, domainTag));
    },
    [counter, lsKey],
  );

  const nextProofHash = useCallback(
    (sk: bigint, balance: bigint, amount: bigint, nullifier: bigint): bigint => {
      const h1 = BigInt(pedersen(sk, balance));
      const h2 = BigInt(pedersen(h1, amount));
      return BigInt(pedersen(h2, nullifier));
    },
    [],
  );

  return { counter, nextNullifier, nextProofHash };
}

