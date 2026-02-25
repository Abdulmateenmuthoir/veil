# Veil

**Confidential ERC20 transfers on Starknet using ElGamal encryption and STARK proofs.**

Veil is a shielded transaction protocol that lets users deposit, transfer, and withdraw STRK tokens without revealing amounts on-chain. Balances are stored as ElGamal ciphertexts — only the key holder can decrypt them. Transfers are validated by zero-knowledge proofs, meaning the contract never sees plaintext amounts.

Built for the **Starknet Re{define} Hackathon — Privacy Track**.

---

## How It Works

### Key Generation
Each user generates an ElGamal keypair entirely client-side. The private key never leaves the browser. The public key is registered on-chain and bound to the user's Starknet address.

### Encrypted Balances
Balances are stored as ElGamal ciphertexts — a pair of Stark curve points `(C1, C2)`. The contract stores 4 `felt252` values per user and never decrypts them.

### Homomorphic Updates
ElGamal is additively homomorphic over elliptic curve points:

```
Enc(a) + Enc(b) = Enc(a + b)
```

This means the contract can update encrypted balances by adding ciphertext points — no decryption required. The client computes the new ciphertext locally and submits it with a proof of correctness.

### Proof System
Transfers and withdrawals are accompanied by a proof hash that attests:
- The sender has sufficient balance
- The new ciphertexts are consistent with the claimed amount
- The operation has not been replayed (nullifier registry)

> **MVP note:** The proof is currently a Pedersen hash commitment rather than a full STARK proof. The contract accepts any non-zero proof hash. A real prover integration is the primary next step toward production.

### Veil Name Service (.veil)
Users register human-readable names (e.g. `alice.veil`) that map to their ElGamal public key. This lets senders address recipients by name instead of raw public key coordinates.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        Browser                           │
│                                                          │
│  ElGamal keypair (generated + stored in localStorage)   │
│  BSGS decryption (recovers plaintext from ciphertext)   │
│  Proof generation (Pedersen hash commitment, MVP)        │
│  Nullifier computation (prevents replay attacks)        │
└────────────────────────┬─────────────────────────────────┘
                         │  starknet.js v9 + starknet-react
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Starknet Sepolia Testnet                     │
│                                                          │
│  ShieldedPool.cairo                                      │
│    - register / re_register                              │
│    - deposit(amount, new_ciphertext)                     │
│    - transfer(recipient_pk, ciphertexts, proof)          │
│    - withdraw(amount, new_ciphertext, proof)             │
│    - get_encrypted_balance(pk) → ciphertext              │
│    - is_nullifier_spent(nullifier) → bool                │
│                                                          │
│  VeilNameRegistry.cairo                                  │
│    - register_name(name, pk_x, pk_y)                     │
│    - resolve(name) → (pk_x, pk_y)                        │
│    - owner_release_name(name)                            │
└──────────────────────────────────────────────────────────┘
```

---

## Features

- **Private balances** — on-chain state is ciphertext only; amounts are never revealed
- **Confidential transfers** — recipient and amount are hidden from the public
- **Homomorphic balance updates** — contract updates encrypted state without decrypting
- **Double-spend prevention** — nullifier registry enforces one-use proofs
- **Veil Name Service** — human-readable `.veil` names replace raw public keys
- **Non-custodial** — private keys are generated and stored in the user's browser only
- **Light / dark mode** — toggle in the navbar, persisted across sessions

---

## Cryptography

| Primitive | Details |
|---|---|
| Curve | Stark curve (same as Starknet's native curve) |
| Encryption | Exponential ElGamal — `Enc(m, r) = (r·G, m·G + r·PK)` |
| Decryption | Baby-Step Giant-Step (BSGS), table cached after first build |
| Homomorphic add | Point addition on ciphertexts: `Enc(a) ⊕ Enc(b) = Enc(a+b)` |
| Nullifier | `Pedersen(sk, nonce, domain_tag)` — domain-separated per operation type |
| Proof (MVP) | Pedersen hash commitment over `(sk, balance, amount, nullifier)` |
| Balance scale | `BALANCE_SCALE = 10⁹` — ciphertexts encrypt gwei, supports up to ~4.3 STRK |

---

## Project Structure

```
Hackathon/
├── contracts/               # Cairo 2.9.1 smart contracts
│   └── src/
│       ├── shielded_pool.cairo
│       ├── name_registry.cairo
│       └── elgamal.cairo    # On-chain curve helpers
├── crypto/                  # TypeScript cryptography library
│   └── src/
│       ├── elgamal.ts       # Keygen, encrypt, decrypt
│       ├── homomorphic.ts   # Ciphertext addition
│       ├── nullifier.ts     # Nullifier derivation
│       ├── proof.ts         # Proof generation (MVP placeholder)
│       └── curve.ts         # Stark curve primitives
├── frontend/                # Next.js 16 app
│   └── src/
│       ├── app/page.tsx     # Main UI orchestration
│       ├── components/      # UI components
│       ├── hooks/           # useShieldedPool, useShieldedBalance, useElGamalKey, …
│       └── lib/constants.ts # Contract addresses
├── scripts/                 # Deployment and test scripts
│   ├── deploy.mjs
│   ├── deploy-registry.mjs
│   └── e2e.mjs              # Full end-to-end test (register → deposit → withdraw)
└── docs/
    └── veil-cryptography.tex
```

---

## Deployed Contracts (Starknet Sepolia)

| Contract | Address |
|---|---|
| ShieldedPool | `0x1c7fed35dcd2c5dd29b69f45bed15ce28491656b082191a7ccedc8029cf48bb` |
| VeilNameRegistry | `0xc81ee86c17a6d17257523f2db5681e59ad04098cf1b9c4e1a6d12083f5c991` |
| STRK Token | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

---

## Running Locally

### Prerequisites
- Node.js 18+
- An [Argent X](https://www.argent.xyz/argent-x/) or [Braavos](https://braavos.app/) wallet funded with Sepolia STRK

### Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### End-to-End Script (optional)

Tests the full register → deposit → withdraw flow against live contracts:

```bash
cd scripts
cp .env.example .env   # fill in ACCOUNT_ADDRESS and PRIVATE_KEY
npm install
node e2e.mjs
```

---

## User Flow

1. **Connect** your Argent or Braavos wallet (Sepolia)
2. **Generate keys** — a fresh ElGamal keypair is created client-side
3. **Register** — publish your public key on-chain and claim a `.veil` name
4. **Deposit** — send STRK into the shielded pool; your encrypted balance updates
5. **Transfer** — send shielded STRK to any `.veil` name; amounts stay private
6. **Withdraw** — pull STRK back to your wallet address

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Cairo 2.9.1, Scarb, OpenZeppelin v0.20.0 |
| Frontend | Next.js 16, React 19, TypeScript 5 |
| Starknet client | starknet.js v9.2.1, starknet-react v5.0.3 |
| Crypto | @scure/starknet (Stark curve), custom ElGamal + BSGS |
| Styling | Tailwind CSS v4 |
| Wallets | Argent X, Braavos |

---

## Known Limitations

- **Proof placeholder** — transfer and withdraw proofs are Pedersen hash commitments, not full STARK proofs. Integrating a Cairo prover is the primary production requirement.
- **Max balance ~4.3 STRK** — BSGS table is bounded at 2³² discrete log steps (gwei scale). Sufficient for demo purposes.
- **Single keypair per address** — each Starknet address can bind exactly one ElGamal keypair. Re-registration resets the balance to zero.

---

## Roadmap

- [ ] Real STARK proof generation via Cairo prover
- [ ] Relayer network (gas-free transfers for recipients)
- [ ] Multi-token support beyond STRK
- [ ] Larger BSGS range for higher balance caps
- [ ] Mobile wallet support
