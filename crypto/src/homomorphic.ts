/**
 * Homomorphic operations on ElGamal ciphertexts.
 *
 * ElGamal over elliptic curves is additively homomorphic:
 *   Enc(a) ⊕ Enc(b) = Enc(a + b)
 *
 * This module provides functions to add/subtract ciphertexts
 * and compute updated balances — all without decryption.
 */

import { pointAdd, pointSub, ZERO } from "./curve";
import {
  type Ciphertext,
  zeroCiphertext,
  encrypt,
  serializeCiphertext,
  type SerializedCiphertext,
} from "./elgamal";
import type { ProjectivePoint } from "./curve";

/**
 * Homomorphically add two ciphertexts.
 * If Enc(a) and Enc(b), result encrypts (a + b).
 */
export function addCiphertexts(a: Ciphertext, b: Ciphertext): Ciphertext {
  return {
    c1: pointAdd(a.c1, b.c1),
    c2: pointAdd(a.c2, b.c2),
  };
}

/**
 * Homomorphically subtract two ciphertexts.
 * If Enc(a) and Enc(b), result encrypts (a - b).
 */
export function subtractCiphertexts(a: Ciphertext, b: Ciphertext): Ciphertext {
  return {
    c1: pointSub(a.c1, b.c1),
    c2: pointSub(a.c2, b.c2),
  };
}

/**
 * Compute the new encrypted balance after a deposit.
 *
 * @param currentBalance - Current encrypted balance ciphertext.
 * @param depositAmount  - Plaintext amount to deposit.
 * @param publicKey      - Depositor's ElGamal public key.
 * @returns New encrypted balance and its serialized form.
 */
export function computeDepositBalance(
  currentBalance: Ciphertext,
  depositAmount: bigint,
  publicKey: ProjectivePoint,
): { newBalance: Ciphertext; serialized: SerializedCiphertext } {
  const { ct: encryptedDeposit } = encrypt(depositAmount, publicKey);
  const newBalance = addCiphertexts(currentBalance, encryptedDeposit);
  return { newBalance, serialized: serializeCiphertext(newBalance) };
}

/**
 * Compute updated balances for a confidential transfer.
 *
 * The sender's balance decreases by `amount`, the recipient's increases.
 * Both updates happen on encrypted data using homomorphic operations.
 *
 * @param senderBalance    - Sender's current encrypted balance.
 * @param recipientBalance - Recipient's current encrypted balance.
 * @param amount           - Plaintext transfer amount (known only to sender).
 * @param senderPK         - Sender's ElGamal public key.
 * @param recipientPK      - Recipient's ElGamal public key.
 * @returns Updated ciphertexts for both parties, serialized for on-chain submission.
 */
export function computeTransferBalances(
  senderBalance: Ciphertext,
  recipientBalance: Ciphertext,
  amount: bigint,
  senderPK: ProjectivePoint,
  recipientPK: ProjectivePoint,
): {
  newSenderBalance: Ciphertext;
  newRecipientBalance: Ciphertext;
  senderSerialized: SerializedCiphertext;
  recipientSerialized: SerializedCiphertext;
} {
  // Encrypt the amount under both keys.
  const { ct: encAmountSender } = encrypt(amount, senderPK);
  const { ct: encAmountRecipient } = encrypt(amount, recipientPK);

  // Sender: balance - amount
  const newSenderBalance = subtractCiphertexts(senderBalance, encAmountSender);
  // Recipient: balance + amount
  const newRecipientBalance = addCiphertexts(recipientBalance, encAmountRecipient);

  return {
    newSenderBalance,
    newRecipientBalance,
    senderSerialized: serializeCiphertext(newSenderBalance),
    recipientSerialized: serializeCiphertext(newRecipientBalance),
  };
}

/**
 * Compute the new encrypted balance after a withdrawal.
 *
 * @param currentBalance - Current encrypted balance.
 * @param withdrawAmount - Plaintext amount to withdraw.
 * @param publicKey      - User's ElGamal public key.
 * @returns New encrypted balance and its serialized form.
 */
export function computeWithdrawBalance(
  currentBalance: Ciphertext,
  withdrawAmount: bigint,
  publicKey: ProjectivePoint,
): { newBalance: Ciphertext; serialized: SerializedCiphertext } {
  const { ct: encryptedAmount } = encrypt(withdrawAmount, publicKey);
  const newBalance = subtractCiphertexts(currentBalance, encryptedAmount);
  return { newBalance, serialized: serializeCiphertext(newBalance) };
}
