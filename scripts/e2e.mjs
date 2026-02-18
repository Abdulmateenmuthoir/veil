/**
 * Veil — End-to-End Test
 *
 * Tests two phases:
 *   1. Crypto layer (offline) — keygen, encrypt/decrypt with BALANCE_SCALE, homomorphic ops
 *   2. Contract layer (Sepolia) — register → deposit → check balance → withdraw
 *
 * Usage:
 *   cd scripts && node e2e.mjs
 */

import { Account, RpcProvider, ec } from "starknet";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = resolve(__dirname, "e2e-keys.json");

config();

// ── Config ─────────────────────────────────────────────────────────────────

// Always test against the most recently deployed contract instance.
const deployed = JSON.parse(readFileSync(resolve(__dirname, "deployed.json"), "utf8"));
const POOL   = deployed.contractAddress;
const STRK   = deployed.erc20Token;
const RPC    = "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";

// Must match frontend/src/hooks/useShieldedBalance.ts
const BALANCE_SCALE = 10n ** 9n;
const CURVE_ORDER = 0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;
const DEPOSIT_WEI  = 10n ** 16n;   // 0.01 STRK
const WITHDRAW_WEI = 5n  * 10n**15n; // 0.005 STRK

// ── EC helpers ──────────────────────────────────────────────────────────────

const G    = ec.starkCurve.ProjectivePoint.BASE;
const ZERO = ec.starkCurve.ProjectivePoint.ZERO;

function randomScalar() {
  const b = randomBytes(32);
  let s = 0n;
  for (const byte of b) s = (s << 8n) | BigInt(byte);
  s = s % CURVE_ORDER;
  return s === 0n ? 1n : s;
}

function genKeyPair() {
  const sk = randomScalar();
  const pk = G.multiply(sk);
  return { sk, pk };
}

// Encrypt amountWei, storing amountGwei inside the ciphertext.
function encryptWei(amountWei, pk) {
  const r = randomScalar();
  const c1 = G.multiply(r);
  const gwei = amountWei / BALANCE_SCALE;
  const mG  = gwei === 0n ? ZERO : G.multiply(gwei);
  const c2  = mG.add(pk.multiply(r));
  return { c1, c2 };
}

function zeroCt() { return { c1: ZERO, c2: ZERO }; }

function addCt(a, b) {
  return { c1: a.c1.add(b.c1), c2: a.c2.add(b.c2) };
}

function subCt(a, b) {
  return { c1: a.c1.add(b.c1.negate()), c2: a.c2.add(b.c2.negate()) };
}

// Decrypt ciphertext → wei (via gwei × BALANCE_SCALE).
function decryptToWei(ct, sk) {
  if (ct.c1.equals(ZERO) && ct.c2.equals(ZERO)) return 0n;
  const skC1 = ct.c1.equals(ZERO) ? ZERO : ct.c1.multiply(sk);
  const mG   = ct.c2.add(skC1.negate());
  if (mG.equals(ZERO)) return 0n;
  const gwei = bsgs(mG, 1n << 32n);
  return gwei !== null ? gwei * BALANCE_SCALE : null;
}

function bsgs(target, maxVal) {
  const m = isqrt(maxVal) + 1n;
  const table = new Map();
  let cur = ZERO;
  for (let j = 0n; j < m; j++) {
    table.set(pointKey(cur), j);
    cur = cur.add(G);
  }
  const mG = G.multiply(m);
  let gamma = target;
  for (let i = 0n; i < m; i++) {
    const j = table.get(pointKey(gamma));
    if (j !== undefined) return i * m + j;
    gamma = gamma.add(mG.negate());
  }
  return null;
}

function isqrt(n) {
  if (n <= 0n) return 0n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

function pointKey(p) {
  if (p.equals(ZERO)) return "O";
  return p.toAffine().x.toString(16);
}

function serCt(ct) {
  if (ct.c1.equals(ZERO) && ct.c2.equals(ZERO))
    return { c1_x: 0n, c1_y: 0n, c2_x: 0n, c2_y: 0n };
  const a1 = ct.c1.toAffine(), a2 = ct.c2.toAffine();
  return { c1_x: a1.x, c1_y: a1.y, c2_x: a2.x, c2_y: a2.y };
}

function ctFromChain(result) {
  // callContract returns hex strings
  return {
    c1_x: BigInt(result[0]), c1_y: BigInt(result[1]),
    c2_x: BigInt(result[2]), c2_y: BigInt(result[3]),
  };
}

function ctFromSer(s) {
  const isZero = s.c1_x === 0n && s.c1_y === 0n && s.c2_x === 0n && s.c2_y === 0n;
  if (isZero) return zeroCt();
  return {
    c1: ec.starkCurve.ProjectivePoint.fromAffine({ x: s.c1_x, y: s.c1_y }),
    c2: ec.starkCurve.ProjectivePoint.fromAffine({ x: s.c2_x, y: s.c2_y }),
  };
}

function toHex(n)       { return "0x" + n.toString(16); }
function formatStrk(wei) { return Number(wei) / 1e18 + " STRK"; }

// ── Logging helpers ─────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function ok(label)  { console.log(`  ✓ ${label}`); pass++; }
function err(label, e) { console.error(`  ✗ ${label}:`, e?.message ?? e); fail++; }
function section(s)  { console.log(`\n── ${s} ──`); }

function assert(cond, label) {
  if (cond) ok(label);
  else { console.error(`  ✗ ${label}`); fail++; }
}

// ── Phase 1: Crypto ─────────────────────────────────────────────────────────

function testCrypto() {
  section("Phase 1: Crypto layer");

  // 1a. Keygen
  const kp = genKeyPair();
  assert(kp.sk > 0n && kp.sk < CURVE_ORDER, "Keygen produces valid private key");

  // 1b. Encrypt/decrypt zero
  const ctZero = encryptWei(0n, kp.pk);
  const decZero = decryptToWei(ctZero, kp.sk);
  assert(decZero === 0n, "Decrypt zero ciphertext → 0");

  // 1c. Encrypt/decrypt 0.01 STRK (10^16 wei → 10^7 gwei)
  const ctDeposit = encryptWei(DEPOSIT_WEI, kp.pk);
  const decDeposit = decryptToWei(ctDeposit, kp.sk);
  assert(decDeposit === DEPOSIT_WEI, `Decrypt 0.01 STRK → ${formatStrk(decDeposit ?? 0n)}`);

  // 1d. Homomorphic accumulation: two deposits
  const ct2 = encryptWei(DEPOSIT_WEI, kp.pk);
  const ctSum = addCt(ctDeposit, ct2);
  const decSum = decryptToWei(ctSum, kp.sk);
  assert(decSum === DEPOSIT_WEI * 2n, `Homomorphic add: 0.01 + 0.01 → ${formatStrk(decSum ?? 0n)}`);

  // 1e. Subtraction (simulating withdraw)
  const ctWithdraw = encryptWei(WITHDRAW_WEI, kp.pk);
  const ctAfter = subCt(ctDeposit, ctWithdraw);
  const decAfter = decryptToWei(ctAfter, kp.sk);
  assert(decAfter === DEPOSIT_WEI - WITHDRAW_WEI,
    `Homomorphic sub: 0.01 - 0.005 → ${formatStrk(decAfter ?? 0n)}`);

  // 1f. Wrong key cannot decrypt correctly
  const kp2 = genKeyPair();
  const decWrong = decryptToWei(ctDeposit, kp2.sk);
  assert(decWrong !== DEPOSIT_WEI, "Wrong key produces wrong/null decryption");
}

// ── Phase 2: Contract ───────────────────────────────────────────────────────

async function testContract() {
  section("Phase 2: Contract layer (Sepolia)");

  const provider = new RpcProvider({ nodeUrl: RPC });
  const account  = new Account({
    provider,
    address: process.env.ACCOUNT_ADDRESS,
    signer:  process.env.PRIVATE_KEY,
  });

  // Reuse a persisted keypair if one exists (avoids ADDRESS_ALREADY_BOUND on re-runs).
  let kp;
  if (existsSync(KEYS_FILE)) {
    const saved = JSON.parse(readFileSync(KEYS_FILE, "utf8"));
    const sk = BigInt(saved.sk);
    kp = { sk, pk: G.multiply(sk) };
    console.log("  Using saved keypair from e2e-keys.json");
  } else {
    kp = genKeyPair();
    const aff = kp.pk.toAffine();
    writeFileSync(KEYS_FILE, JSON.stringify({ sk: kp.sk.toString(), pkx: aff.x.toString(), pky: aff.y.toString() }));
    console.log("  Generated fresh keypair → saved to e2e-keys.json");
  }
  const pkAff = kp.pk.toAffine();
  console.log(`  Account  : ${process.env.ACCOUNT_ADDRESS}`);
  console.log(`  Pool     : ${POOL}`);
  console.log(`  PK_X     : 0x${pkAff.x.toString(16).slice(0, 16)}...`);

  // ── 2a. Check / perform registration ──
  let isReg;
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "is_registered",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    isReg = BigInt(res[0]) !== 0n;
    ok(`is_registered call succeeded (result: ${isReg})`);
  } catch (e) { err("is_registered call", e); return; }

  if (!isReg) {
    try {
      const tx = await account.execute([{
        contractAddress: POOL,
        entrypoint: "register",
        calldata: [toHex(pkAff.x), toHex(pkAff.y)],
      }]);
      console.log(`  → register tx: ${tx.transaction_hash}`);
      await provider.waitForTransaction(tx.transaction_hash);
      ok("register confirmed on-chain");
    } catch (e) { err("register", e); return; }
  } else {
    ok("already registered — skipping register tx");
  }

  // ── 2b. Fetch initial on-chain balance ──
  let onChainBal;
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "get_encrypted_balance",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    onChainBal = ctFromSer(ctFromChain(res));
    ok("get_encrypted_balance call succeeded");
  } catch (e) { err("get_encrypted_balance", e); return; }

  const balBefore = decryptToWei(onChainBal, kp.sk);
  console.log(`  Balance before deposit: ${formatStrk(balBefore ?? 0n)}`);

  // ── 2c. Deposit 0.01 STRK ──
  const encDeposit = encryptWei(DEPOSIT_WEI, kp.pk);
  const newBalAfterDeposit = addCt(onChainBal, encDeposit);
  const newSerDeposit = serCt(newBalAfterDeposit);

  try {
    const tx = await account.execute([
      {
        contractAddress: STRK,
        entrypoint: "approve",
        calldata: [POOL, toHex(DEPOSIT_WEI), "0x0"],
      },
      {
        contractAddress: POOL,
        entrypoint: "deposit",
        calldata: [
          toHex(DEPOSIT_WEI), "0x0",
          toHex(newSerDeposit.c1_x), toHex(newSerDeposit.c1_y),
          toHex(newSerDeposit.c2_x), toHex(newSerDeposit.c2_y),
        ],
      },
    ]);
    console.log(`  → deposit tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    ok(`deposit 0.01 STRK confirmed`);
  } catch (e) { err("deposit", e); return; }

  // ── 2d. Verify balance on-chain after deposit ──
  let balAfterDeposit;
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "get_encrypted_balance",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    const onChainAfter = ctFromSer(ctFromChain(res));
    balAfterDeposit = decryptToWei(onChainAfter, kp.sk);
    const expected = (balBefore ?? 0n) + DEPOSIT_WEI;
    assert(
      balAfterDeposit === expected,
      `Balance after deposit: ${formatStrk(balAfterDeposit ?? 0n)} (expected ${formatStrk(expected)})`,
    );
  } catch (e) { err("balance check after deposit", e); }

  // ── 2e. Withdraw 0.005 STRK ──
  const ctBeforeWithdraw = newBalAfterDeposit;
  const encWithdraw = encryptWei(WITHDRAW_WEI, kp.pk);
  const newBalAfterWithdraw = subCt(ctBeforeWithdraw, encWithdraw);
  const newSerWithdraw = serCt(newBalAfterWithdraw);

  // Proof + nullifier (MVP: any non-zero hash)
  const nullifier  = randomScalar();
  const proofHash  = randomScalar();

  try {
    const tx = await account.execute([{
      contractAddress: POOL,
      entrypoint: "withdraw",
      calldata: [
        toHex(WITHDRAW_WEI), "0x0",
        toHex(newSerWithdraw.c1_x), toHex(newSerWithdraw.c1_y),
        toHex(newSerWithdraw.c2_x), toHex(newSerWithdraw.c2_y),
        toHex(proofHash),
        toHex(nullifier),
      ],
    }]);
    console.log(`  → withdraw tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    ok(`withdraw 0.005 STRK confirmed`);
  } catch (e) { err("withdraw", e); return; }

  // ── 2f. Verify balance on-chain after withdraw ──
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "get_encrypted_balance",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    const onChainFinal = ctFromSer(ctFromChain(res));
    const balFinal = decryptToWei(onChainFinal, kp.sk);
    const expected = (balBefore ?? 0n) + DEPOSIT_WEI - WITHDRAW_WEI;
    assert(
      balFinal === expected,
      `Balance after withdraw: ${formatStrk(balFinal ?? 0n)} (expected ${formatStrk(expected)})`,
    );
  } catch (e) { err("balance check after withdraw", e); }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════╗");
  console.log("║   Veil — End-to-End Test Suite    ║");
  console.log("╚═══════════════════════════════════╝");

  testCrypto();
  await testContract();

  console.log(`\n── Results: ${pass} passed, ${fail} failed ──`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
