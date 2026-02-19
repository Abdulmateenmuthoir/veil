"use client";

import { useCallback, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { RpcProvider } from "starknet";
import { VEIL_NAME_REGISTRY_ADDRESS } from "@/lib/constants";

const SEPOLIA_RPC =
  "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";

// ── Felt252 short-string utilities ──────────────────────────────────────────

/**
 * Encode a short string (≤ 31 ASCII chars) as a felt252 BigInt.
 * This is the standard Starknet short-string encoding.
 */
export function strToFelt252(s: string): bigint {
  if (s.length === 0) throw new Error("Name must not be empty");
  if (s.length > 31) throw new Error("Name must be ≤ 31 characters");
  let result = 0n;
  for (const ch of s) {
    result = result * 256n + BigInt(ch.charCodeAt(0));
  }
  return result;
}

/**
 * Decode a felt252 BigInt back to a short string.
 * Returns "" for zero.
 */
export function felt252ToStr(felt: bigint): string {
  if (felt === 0n) return "";
  const bytes: number[] = [];
  let n = felt;
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return String.fromCharCode(...bytes);
}

/**
 * Validate a .veil name: lowercase alphanumeric + hyphens, 3–31 chars,
 * no leading or trailing hyphen.
 */
export function validateVeilName(name: string): boolean {
  if (name.length < 3 || name.length > 31) return false;
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  if (name.startsWith("-") || name.endsWith("-")) return false;
  return true;
}

// ── Hook ────────────────────────────────────────────────────────────────────

const toHex = (n: bigint): string => "0x" + n.toString(16);

export function useVeilName() {
  const { account } = useAccount();
  const provider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC }), []);

  /**
   * Returns true if the name is available (not taken), false if taken.
   * Throws if the registry address is not set.
   */
  const checkNameAvailable = useCallback(
    async (name: string): Promise<boolean> => {
      const nameFelt = strToFelt252(name);
      const result = await provider.callContract({
        contractAddress: VEIL_NAME_REGISTRY_ADDRESS,
        entrypoint: "is_name_taken",
        calldata: [toHex(nameFelt)],
      });
      return BigInt(result[0]) === 0n; // available when NOT taken
    },
    [provider],
  );

  /**
   * Resolve a .veil name to its ElGamal public key.
   * Pass the bare name (without ".veil" suffix).
   * Returns null if the name is not registered.
   */
  const resolveName = useCallback(
    async (name: string): Promise<{ pkX: bigint; pkY: bigint } | null> => {
      const nameFelt = strToFelt252(name);
      const result = await provider.callContract({
        contractAddress: VEIL_NAME_REGISTRY_ADDRESS,
        entrypoint: "resolve",
        calldata: [toHex(nameFelt)],
      });
      const pkX = BigInt(result[0]);
      const pkY = BigInt(result[1]);
      if (pkX === 0n && pkY === 0n) return null;
      return { pkX, pkY };
    },
    [provider],
  );

  /**
   * Get the .veil name (bare string, without suffix) registered to a Starknet address.
   * Returns "" if the address has no name.
   */
  const getNameForAddress = useCallback(
    async (address: string): Promise<string> => {
      const result = await provider.callContract({
        contractAddress: VEIL_NAME_REGISTRY_ADDRESS,
        entrypoint: "get_name",
        calldata: [address],
      });
      return felt252ToStr(BigInt(result[0]));
    },
    [provider],
  );

  /**
   * Register a .veil name via a single call to VeilNameRegistry.
   * The caller must already be registered in ShieldedPool.
   */
  const registerName = useCallback(
    async (name: string, pkX: bigint, pkY: bigint): Promise<string> => {
      if (!account) throw new Error("Wallet not connected");
      const nameFelt = strToFelt252(name);
      const result = await account.execute([
        {
          contractAddress: VEIL_NAME_REGISTRY_ADDRESS,
          entrypoint: "register_name",
          calldata: [toHex(nameFelt), toHex(pkX), toHex(pkY)],
        },
      ]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  return {
    checkNameAvailable,
    resolveName,
    getNameForAddress,
    registerName,
  };
}
