import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  encrypt,
  decrypt,
  zeroCiphertext,
  serializeCiphertext,
} from "./elgamal";
import {
  addCiphertexts,
  computeDepositBalance,
  computeTransferBalances,
} from "./homomorphic";
import { generateNullifier, generateDomainNullifier } from "./nullifier";
import { generateTransferProof, generateWithdrawProof } from "./proof";

describe("KeyPair generation", () => {
  it("generates a valid keypair", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey).toBeGreaterThan(0n);
    expect(kp.publicKey).toBeDefined();
  });

  it("generates unique keypairs", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(a.privateKey).not.toBe(b.privateKey);
  });
});

describe("ElGamal encrypt/decrypt", () => {
  it("encrypts and decrypts 0", () => {
    const kp = generateKeyPair();
    const { ct } = encrypt(0n, kp.publicKey);
    const result = decrypt(ct, kp.privateKey, 100n);
    expect(result).toBe(0n);
  });

  it("encrypts and decrypts a small amount", () => {
    const kp = generateKeyPair();
    const { ct } = encrypt(42n, kp.publicKey);
    const result = decrypt(ct, kp.privateKey, 1000n);
    expect(result).toBe(42n);
  });

  it("encrypts and decrypts a larger amount", () => {
    const kp = generateKeyPair();
    const { ct } = encrypt(10000n, kp.publicKey);
    const result = decrypt(ct, kp.privateKey, 20000n);
    expect(result).toBe(10000n);
  });

  it("fails to decrypt with wrong key", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { ct } = encrypt(42n, alice.publicKey);
    const result = decrypt(ct, bob.privateKey, 1000n);
    // Should either return null or a wrong value.
    expect(result).not.toBe(42n);
  });
});

describe("Homomorphic operations", () => {
  it("adds two encrypted values", () => {
    const kp = generateKeyPair();
    const { ct: ct1 } = encrypt(100n, kp.publicKey);
    const { ct: ct2 } = encrypt(200n, kp.publicKey);
    const sum = addCiphertexts(ct1, ct2);
    const result = decrypt(sum, kp.privateKey, 1000n);
    expect(result).toBe(300n);
  });

  it("computes deposit balance from zero", () => {
    const kp = generateKeyPair();
    const zero = zeroCiphertext();
    const { newBalance } = computeDepositBalance(zero, 500n, kp.publicKey);
    const result = decrypt(newBalance, kp.privateKey, 1000n);
    expect(result).toBe(500n);
  });

  it("computes transfer balances correctly", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();

    // Alice starts with 1000, Bob with 0.
    const { ct: aliceBal } = encrypt(1000n, alice.publicKey);
    const bobBal = zeroCiphertext();

    // Alice sends 300 to Bob.
    const { newSenderBalance, newRecipientBalance } = computeTransferBalances(
      aliceBal,
      bobBal,
      300n,
      alice.publicKey,
      bob.publicKey,
    );

    const aliceResult = decrypt(newSenderBalance, alice.privateKey, 2000n);
    const bobResult = decrypt(newRecipientBalance, bob.privateKey, 2000n);

    expect(aliceResult).toBe(700n);
    expect(bobResult).toBe(300n);
  });
});

describe("Nullifiers", () => {
  it("generates deterministic nullifiers", () => {
    const sk = 12345n;
    const n1 = generateNullifier(sk, 1n);
    const n2 = generateNullifier(sk, 1n);
    expect(n1).toBe(n2);
  });

  it("generates different nullifiers for different nonces", () => {
    const sk = 12345n;
    const n1 = generateNullifier(sk, 1n);
    const n2 = generateNullifier(sk, 2n);
    expect(n1).not.toBe(n2);
  });

  it("generates different domain nullifiers", () => {
    const sk = 12345n;
    const t = generateDomainNullifier(sk, 1n, "transfer");
    const w = generateDomainNullifier(sk, 1n, "withdraw");
    expect(t).not.toBe(w);
  });
});

describe("Proof generation", () => {
  it("generates a valid transfer proof", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { ct: aliceBal } = encrypt(1000n, alice.publicKey);
    const bobBal = zeroCiphertext();

    const { newSenderBalance, newRecipientBalance } = computeTransferBalances(
      aliceBal, bobBal, 300n, alice.publicKey, bob.publicKey,
    );

    const proof = generateTransferProof(
      alice.privateKey, 1000n, 300n, 99n,
      newSenderBalance, newRecipientBalance,
    );

    expect(proof.proofHash).not.toBe(0n);
    expect(proof.nullifier).toBe(99n);
  });

  it("rejects transfer with insufficient balance", () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const { ct: aliceBal } = encrypt(100n, alice.publicKey);
    const bobBal = zeroCiphertext();

    const { newSenderBalance, newRecipientBalance } = computeTransferBalances(
      aliceBal, bobBal, 200n, alice.publicKey, bob.publicKey,
    );

    expect(() =>
      generateTransferProof(
        alice.privateKey, 100n, 200n, 99n,
        newSenderBalance, newRecipientBalance,
      ),
    ).toThrow("Insufficient balance");
  });

  it("generates a valid withdraw proof", () => {
    const kp = generateKeyPair();
    const { ct } = encrypt(500n, kp.publicKey);

    const proof = generateWithdrawProof(
      kp.privateKey, 500n, 200n, 88n, ct,
    );

    expect(proof.proofHash).not.toBe(0n);
  });
});

describe("Serialization", () => {
  it("serializes zero ciphertext", () => {
    const s = serializeCiphertext(zeroCiphertext());
    expect(s.c1_x).toBe(0n);
    expect(s.c1_y).toBe(0n);
    expect(s.c2_x).toBe(0n);
    expect(s.c2_y).toBe(0n);
  });

  it("serializes non-zero ciphertext to bigints", () => {
    const kp = generateKeyPair();
    const { ct } = encrypt(42n, kp.publicKey);
    const s = serializeCiphertext(ct);
    expect(s.c1_x).toBeGreaterThan(0n);
    expect(s.c2_x).toBeGreaterThan(0n);
  });
});
