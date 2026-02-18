"use client";

import { useCallback, useMemo } from "react";
import { useAccount } from "@starknet-react/core";
import { RpcProvider } from "starknet";
import { SHIELDED_POOL_ADDRESS, ERC20_TOKEN_ADDRESS } from "@/lib/constants";

const SEPOLIA_RPC = "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";

const toHex = (n: bigint): string => "0x" + n.toString(16);

/**
 * Handles all on-chain interactions with the ShieldedPool contract.
 * Reads via RpcProvider.callContract(), writes via account.execute().
 */
export function useShieldedPool() {
  const { account } = useAccount();

  const provider = useMemo(() => new RpcProvider({ nodeUrl: SEPOLIA_RPC }), []);

  // ── View calls (via provider.callContract) ──

  const fetchBalance = useCallback(
    async (pkX: bigint, pkY: bigint) => {
      const result = await provider.callContract({
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "get_encrypted_balance",
        calldata: [toHex(pkX), toHex(pkY)],
      });
      // Result is an array of felt252 hex strings
      return {
        c1x: BigInt(result[0]),
        c1y: BigInt(result[1]),
        c2x: BigInt(result[2]),
        c2y: BigInt(result[3]),
      };
    },
    [provider],
  );

  const checkRegistered = useCallback(
    async (pkX: bigint, pkY: bigint): Promise<boolean> => {
      const result = await provider.callContract({
        contractAddress: SHIELDED_POOL_ADDRESS,
        entrypoint: "is_registered",
        calldata: [toHex(pkX), toHex(pkY)],
      });
      // bool: 0 = false, 1 = true
      return BigInt(result[0]) !== 0n;
    },
    [provider],
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
    deposit,
    transfer,
    withdraw,
    fetchBalance,
    checkRegistered,
  };
}
