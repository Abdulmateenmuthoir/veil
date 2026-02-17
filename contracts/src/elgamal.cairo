/// ElGamal types for on-chain encrypted balance storage.
///
/// An ElGamal ciphertext is a pair (C1, C2) of elliptic curve points:
///   C1 = r * G            (ephemeral public key)
///   C2 = M + r * PK       (encrypted message point)
///
/// Homomorphic addition:
///   Enc(a) + Enc(b) = (C1_a + C1_b, C2_a + C2_b) = Enc(a + b)
///
/// This allows the contract to accept updated ciphertexts from clients
/// without ever learning the plaintext values. STARK proofs verify
/// that updates are honestly computed.

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct ECPoint {
    pub x: felt252,
    pub y: felt252,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Ciphertext {
    pub c1: ECPoint,
    pub c2: ECPoint,
}
