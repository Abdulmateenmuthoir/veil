/**
 * Proof generation helpers for Veil transactions.
 *
 * In production, these would invoke a Cairo prover to generate
 * real STARK proofs. For the hackathon MVP, we generate proof
 * placeholders that the contract accepts (non-zero hashes).
 *
 * The proofs attest to:
 *   - Transfer: sender_balance >= amount AND amount > 0
 *   - Withdraw: decrypted_balance >= amount AND correct new ciphertext
 *
 * When a full prover is integrated, swap the placeholder functions
 * for real STARK proof generation calls.
 */

import { pedersen } from "@scure/starknet";
import type { Ciphertext, SerializedCiphertext } from "./elgamal";
import { serializeCiphertext } from "./elgamal";

/** Wrap pedersen to return bigint. */
function pedersenBigInt(a: bigint, b: bigint): bigint {
  return BigInt(pedersen(a, b));
}

export interface TransferProofData {
  proofHash: bigint;
  nullifier: bigint;
  senderNewBalance: SerializedCiphertext;
  recipientNewBalance: SerializedCiphertext;
}

export interface WithdrawProofData {
  proofHash: bigint;
  nullifier: bigint;
  newBalance: SerializedCiphertext;
}

/**
 * Generate a transfer proof.
 *
 * MVP: creates a Pedersen hash commitment binding the transfer parameters.
 * Production: replace with actual STARK proof generation.
 */
export function generateTransferProof(
  senderSk: bigint,
  senderBalance: bigint,
  amount: bigint,
  nullifier: bigint,
  newSenderBalance: Ciphertext,
  newRecipientBalance: Ciphertext,
): TransferProofData {
  if (amount <= 0n) throw new Error("Amount must be positive");
  if (senderBalance < amount) throw new Error("Insufficient balance");

  const h1 = pedersenBigInt(senderSk, senderBalance);
  const h2 = pedersenBigInt(h1, amount);
  const proofHash = pedersenBigInt(h2, nullifier);

  return {
    proofHash,
    nullifier,
    senderNewBalance: serializeCiphertext(newSenderBalance),
    recipientNewBalance: serializeCiphertext(newRecipientBalance),
  };
}

/**
 * Generate a withdrawal proof.
 *
 * MVP: creates a Pedersen hash commitment binding the withdrawal parameters.
 * Production: replace with actual STARK proof generation.
 */
export function generateWithdrawProof(
  sk: bigint,
  balance: bigint,
  amount: bigint,
  nullifier: bigint,
  newBalance: Ciphertext,
): WithdrawProofData {
  if (amount <= 0n) throw new Error("Amount must be positive");
  if (balance < amount) throw new Error("Insufficient balance");

  const h1 = pedersenBigInt(sk, balance);
  const h2 = pedersenBigInt(h1, amount);
  const proofHash = pedersenBigInt(h2, nullifier);

  return {
    proofHash,
    nullifier,
    newBalance: serializeCiphertext(newBalance),
  };
}
