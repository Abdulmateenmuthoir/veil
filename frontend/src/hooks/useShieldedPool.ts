"use client";

import { useCallback, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { RpcProvider } from "starknet";
import { SHIELDED_POOL_ADDRESS, ERC20_TOKEN_ADDRESS, VEIL_NAME_REGISTRY_ADDRESS } from "@/lib/constants";
import { strToFelt252 } from "@/hooks/useVeilName";

const SEPOLIA_RPC = "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";
const SEPOLIA_RPC_FALLBACK = "https://free-rpc.nethermind.io/sepolia-juno/";

const toHex = (n: bigint): string => "0x" + n.toString(16);

/** Retry a call up to `attempts` times, then try the fallback provider. */
async function withRetry<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await primary();
    } catch (err) {
      if (i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  return fallback();
}

/**
 * Handles all on-chain interactions with the ShieldedPool contract.
 * Reads via RpcProvider.callContract(), writes via account.execute().
 */
export function useShieldedPool() {
  const { account } = useAccount();

  const provider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC }), []);
  const fallbackProvider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC_FALLBACK }), []);

  // ── View calls (via provider.callContract) ──

  const fetchBalance = useCallback(
    async (pkX: bigint, pkY: bigint) => {
      const call = (p: typeof provider) =>
        p.callContract({
          contractAddress: SHIELDED_POOL_ADDRESS,
          entrypoint: "get_encrypted_balance",
          calldata: [toHex(pkX), toHex(pkY)],
        });
      const result = await withRetry(() => call(provider), () => call(fallbackProvider));
      return {
        c1x: BigInt(result[0]),
        c1y: BigInt(result[1]),
        c2x: BigInt(result[2]),
        c2y: BigInt(result[3]),
      };
    },
    [provider, fallbackProvider],
  );

  const checkRegistered = useCallback(
    async (pkX: bigint, pkY: bigint): Promise<boolean> => {
      const call = (p: typeof provider) =>
        p.callContract({
          contractAddress: SHIELDED_POOL_ADDRESS,
          entrypoint: "is_registered",
          calldata: [toHex(pkX), toHex(pkY)],
        });
      const result = await withRetry(() => call(provider), () => call(fallbackProvider));
      return BigInt(result[0]) !== 0n;
    },
    [provider, fallbackProvider],
  );

  // ── Write calls (via account.execute) ──

  const register = useCallback(
    async (pkX: bigint, pkY: bigint) => {
      if (!account) throw new Error("Wallet not connected");
      const result = await account.execute([{
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "register",
        calldata: [toHex(pkX), toHex(pkY)],
      }]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  const reRegister = useCallback(
    async (pkX: bigint, pkY: bigint) => {
      if (!account) throw new Error("Wallet not connected");
      const result = await account.execute([{
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "re_register",
        calldata: [toHex(pkX), toHex(pkY)],
      }]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  /**
   * Combined multicall: register in ShieldedPool + claim a .veil name.
   * Both calls are submitted in a single transaction - one wallet confirmation.
   */
  const registerWithName = useCallback(
    async (pkX: bigint, pkY: bigint, name: string) => {
      if (!account) throw new Error("Wallet not connected");
      const nameFelt = strToFelt252(name);
      const result = await account.execute([
        {
          contractAddress: SHIELDED_POOL_ADDRESS,
          entrypoint: "register",
          calldata: [toHex(pkX), toHex(pkY)],
        },
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

  const deposit = useCallback(
    async (
      amount: bigint,
      ct: { c1_x: bigint; c1_y: bigint; c2_x: bigint; c2_y: bigint },
    ) => {
      if (!account) throw new Error("Wallet not connected");
      // Multicall: approve ERC20 spending then deposit into pool
      const result = await account.execute([
        {
          contractAddress: ERC20_TOKEN_ADDRESS,
          entrypoint: "approve",
          calldata: [SHIELDED_POOL_ADDRESS, toHex(amount), "0x0"],
        },
        {
          contractAddress: SHIELDED_POOL_ADDRESS,
          entrypoint: "deposit",
          calldata: [
            toHex(amount), "0x0", // u256 (low, high)
            toHex(ct.c1_x),
            toHex(ct.c1_y),
            toHex(ct.c2_x),
            toHex(ct.c2_y),
          ],
        },
      ]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  const transfer = useCallback(
    async (
      recipientPkX: bigint,
      recipientPkY: bigint,
      senderCt: { c1_x: bigint; c1_y: bigint; c2_x: bigint; c2_y: bigint },
      recipientCt: { c1_x: bigint; c1_y: bigint; c2_x: bigint; c2_y: bigint },
      proofHash: bigint,
      nullifier: bigint,
    ) => {
      if (!account) throw new Error("Wallet not connected");
      const result = await account.execute([{
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "transfer",
        calldata: [
          toHex(recipientPkX),
          toHex(recipientPkY),
          toHex(senderCt.c1_x),
          toHex(senderCt.c1_y),
          toHex(senderCt.c2_x),
          toHex(senderCt.c2_y),
          toHex(recipientCt.c1_x),
          toHex(recipientCt.c1_y),
          toHex(recipientCt.c2_x),
          toHex(recipientCt.c2_y),
          toHex(proofHash),
          toHex(nullifier),
        ],
      }]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  const withdraw = useCallback(
    async (
      amount: bigint,
      ct: { c1_x: bigint; c1_y: bigint; c2_x: bigint; c2_y: bigint },
      proofHash: bigint,
      nullifier: bigint,
    ) => {
      if (!account) throw new Error("Wallet not connected");
      const result = await account.execute([{
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "withdraw",
        calldata: [
          toHex(amount), "0x0", // u256 (low, high)
          toHex(ct.c1_x),
          toHex(ct.c1_y),
          toHex(ct.c2_x),
          toHex(ct.c2_y),
          toHex(proofHash),
          toHex(nullifier),
        ],
      }]);
      await provider.waitForTransaction(result.transaction_hash);
      return result.transaction_hash;
    },
    [account, provider],
  );

  return {
    register,
    reRegister,
    registerWithName,
    deposit,
    transfer,
    withdraw,
    fetchBalance,
    checkRegistered,
  };
}
