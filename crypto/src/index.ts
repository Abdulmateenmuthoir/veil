/**
 * @veil/crypto — Client-side ElGamal encryption for Veil protocol.
 *
 * Usage:
 *   import { generateKeyPair, encrypt, decrypt, ... } from "@veil/crypto";
 */

// Core ElGamal
export {
  generateKeyPair,
  derivePublicKey,
  encrypt,
  encryptWithRandomness,
  decrypt,
  serializeCiphertext,
  zeroCiphertext,
  type KeyPair,
  type Ciphertext,
  type SerializedCiphertext,
} from "./elgamal";

// Homomorphic operations
export {
  addCiphertexts,
  subtractCiphertexts,
  computeDepositBalance,
  computeTransferBalances,
  computeWithdrawBalance,
} from "./homomorphic";

// Nullifiers
export {
  generateNullifier,
  generateDomainNullifier,
  nonceFromCounter,
  randomNonce,
} from "./nullifier";

// Proof generation
export {
  generateTransferProof,
  generateWithdrawProof,
  type TransferProofData,
  type WithdrawProofData,
} from "./proof";

// Curve utilities (for advanced usage)
export {
  toAffine,
  fromAffine,
  isZero,
  type ProjectivePoint,
} from "./curve";
