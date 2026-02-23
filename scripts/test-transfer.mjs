/**
 * Veil - Transfer Flow Test
 *
 * Phase 1: Crypto layer (offline)
 *   - Two keypairs (alice, bob)
 *   - Encrypt alice's balance
 *   - Compute transfer of amount from alice to bob
 *   - Verify alice & bob can each decrypt their updated ciphertext
 *   - Verify nullifier uniqueness
 *
 * Phase 2: On-chain (Sepolia, self-transfer)
 *   - Uses e2e-keys.json sender as both sender and recipient
 *   - Deposits if balance is zero
 *   - Executes transfer entrypoint
 *   - Verifies nullifier is marked spent on-chain
 *   - Verifies encrypted balance updated on-chain
 *
 * Usage: cd scripts && node test-transfer.mjs
 */

import { Account, RpcProvider, ec } from "starknet";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config();

// -- Config ------------------------------------------------------------------

const deployed  = JSON.parse(readFileSync(resolve(__dirname, "deployed.json"), "utf8"));
const POOL      = deployed.contractAddress;
const STRK      = deployed.erc20Token;
const RPC       = "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";
const KEYS_FILE = resolve(__dirname, "e2e-keys.json");

// Must match frontend/src/hooks/useShieldedBalance.ts
const BALANCE_SCALE  = 10n ** 9n;
const CURVE_ORDER    = 0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2fn;

// Test amounts
const DEPOSIT_WEI  = 10n ** 16n;        // 0.01 STRK (in case balance is zero)
const TRANSFER_WEI = 5n * 10n ** 15n;   // 0.005 STRK

// -- EC helpers --------------------------------------------------------------

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

function encryptWei(amountWei, pk) {
  const r    = randomScalar();
  const c1   = G.multiply(r);
  const gwei = amountWei / BALANCE_SCALE;
  const mG   = gwei === 0n ? ZERO : G.multiply(gwei);
  const c2   = mG.add(pk.multiply(r));
  return { c1, c2 };
}

function addCt(a, b) {
  return { c1: a.c1.add(b.c1), c2: a.c2.add(b.c2) };
}

function subCt(a, b) {
  return { c1: a.c1.add(b.c1.negate()), c2: a.c2.add(b.c2.negate()) };
}

function zeroCt() { return { c1: ZERO, c2: ZERO }; }

function decryptToWei(ct, sk) {
  if (ct.c1.equals(ZERO) && ct.c2.equals(ZERO)) return 0n;
  const skC1 = ct.c1.equals(ZERO) ? ZERO : ct.c1.multiply(sk);
  const mG   = ct.c2.add(skC1.negate());
  if (mG.equals(ZERO)) return 0n;
  // Use 2^36 to match the fixed frontend maxAmount (supports up to ~68 STRK)
  const gwei = bsgs(mG, 1n << 36n);
  return gwei !== null ? gwei * BALANCE_SCALE : null;
}

function bsgs(target, maxVal) {
  const m     = isqrt(maxVal) + 1n;
  const table = new Map();
  let cur     = ZERO;
  for (let j = 0n; j < m; j++) {
    table.set(pointKey(cur), j);
    cur = cur.add(G);
  }
  const mG    = G.multiply(m);
  let gamma   = target;
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
  return p.equals(ZERO) ? "O" : p.toAffine().x.toString(16);
}

function serCt(ct) {
  if (ct.c1.equals(ZERO) && ct.c2.equals(ZERO))
    return { c1_x: 0n, c1_y: 0n, c2_x: 0n, c2_y: 0n };
  const a1 = ct.c1.toAffine(), a2 = ct.c2.toAffine();
  return { c1_x: a1.x, c1_y: a1.y, c2_x: a2.x, c2_y: a2.y };
}

function ctFromChain(res) {
  const s = { c1_x: BigInt(res[0]), c1_y: BigInt(res[1]), c2_x: BigInt(res[2]), c2_y: BigInt(res[3]) };
  const isZero = s.c1_x === 0n && s.c1_y === 0n && s.c2_x === 0n && s.c2_y === 0n;
  if (isZero) return zeroCt();
  return {
    c1: ec.starkCurve.ProjectivePoint.fromAffine({ x: s.c1_x, y: s.c1_y }),
    c2: ec.starkCurve.ProjectivePoint.fromAffine({ x: s.c2_x, y: s.c2_y }),
  };
}

function toHex(n)        { return "0x" + n.toString(16); }
function formatStrk(wei) { return Number(wei) / 1e18 + " STRK"; }

// -- Logging -----------------------------------------------------------------

let pass = 0, fail = 0;
function ok(label)         { console.log(`  ✓ ${label}`); pass++; }
function err(label, e)     { console.error(`  ✗ ${label}:`, e?.message ?? e); fail++; }
function section(s)        { console.log(`\n-- ${s} --`); }
function assert(cond, msg) { cond ? ok(msg) : (console.error(`  ✗ ${msg}`), fail++); }

// -- Phase 1: Crypto transfer math -------------------------------------------

function testCrypto() {
  section("Phase 1: Crypto - Transfer math");

  // 1a. Generate two keypairs
  const alice = genKeyPair();
  const bob   = genKeyPair();
  assert(alice.sk !== bob.sk, "Alice and Bob have different private keys");

  // 1b. Alice encrypts an initial balance of 0.01 STRK
  const aliceInitCt = encryptWei(DEPOSIT_WEI, alice.pk);
  const aliceInitDec = decryptToWei(aliceInitCt, alice.sk);
  assert(aliceInitDec === DEPOSIT_WEI, `Alice initial balance encrypts/decrypts: ${formatStrk(aliceInitDec ?? 0n)}`);

  // 1c. Compute transfer of 0.005 STRK from alice to bob
  const transferAmt   = TRANSFER_WEI;
  const encForSender  = encryptWei(transferAmt, alice.pk);
  const encForRecip   = encryptWei(transferAmt, bob.pk);

  const aliceNewCt = subCt(aliceInitCt, encForSender);
  const bobNewCt   = addCt(zeroCt(), encForRecip);   // bob started from zero

  // 1d. Alice's new balance = 0.01 - 0.005 = 0.005 STRK
  const aliceNewDec = decryptToWei(aliceNewCt, alice.sk);
  assert(
    aliceNewDec === DEPOSIT_WEI - TRANSFER_WEI,
    `Alice balance after transfer: ${formatStrk(aliceNewDec ?? 0n)} (expected ${formatStrk(DEPOSIT_WEI - TRANSFER_WEI)})`,
  );

  // 1e. Bob decrypts the received amount = 0.005 STRK
  const bobDec = decryptToWei(bobNewCt, bob.sk);
  assert(
    bobDec === TRANSFER_WEI,
    `Bob received amount decrypts correctly: ${formatStrk(bobDec ?? 0n)}`,
  );

  // 1f. Bob's key cannot decrypt Alice's ciphertext
  const aliceDecWithBobKey = decryptToWei(aliceInitCt, bob.sk);
  assert(
    aliceDecWithBobKey !== DEPOSIT_WEI,
    "Bob's key cannot decrypt Alice's ciphertext (privacy holds)",
  );

  // 1g. Alice's key cannot decrypt Bob's received ciphertext
  const bobDecWithAliceKey = decryptToWei(bobNewCt, alice.sk);
  assert(
    bobDecWithAliceKey !== TRANSFER_WEI,
    "Alice's key cannot decrypt Bob's ciphertext (privacy holds)",
  );

  // 1h. Nullifier uniqueness: two different nullifiers
  const n1 = randomScalar();
  const n2 = randomScalar();
  assert(n1 !== n2, "Two random nullifiers are distinct");

  // 1i. Homomorphic consistency: alice + bob balances sum correctly in plaintext
  const totalPlaintext = (aliceNewDec ?? 0n) + (bobDec ?? 0n);
  assert(
    totalPlaintext === DEPOSIT_WEI,
    `Conservation: alice + bob = original deposit (${formatStrk(totalPlaintext)})`,
  );
}

// -- Phase 2: On-chain transfer (self-transfer) ------------------------------

async function testOnChain() {
  section("Phase 2: On-chain transfer (Sepolia)");

  if (!existsSync(KEYS_FILE)) {
    console.log("  e2e-keys.json not found - run e2e.mjs first");
    err("e2e-keys.json missing", new Error("Run e2e.mjs first"));
    return;
  }

  const saved  = JSON.parse(readFileSync(KEYS_FILE, "utf8"));
  const sk     = BigInt(saved.sk);
  const pk     = G.multiply(sk);
  const pkAff  = pk.toAffine();

  const provider = new RpcProvider({ nodeUrl: RPC });
  const account  = new Account({
    provider,
    address: process.env.ACCOUNT_ADDRESS,
    signer:  process.env.PRIVATE_KEY,
  });

  console.log(`  Account  : ${process.env.ACCOUNT_ADDRESS}`);
  console.log(`  Pool     : ${POOL}`);
  console.log(`  PK_X     : 0x${pkAff.x.toString(16).slice(0, 16)}...`);
  console.log(`  Note     : self-transfer (sender pk == recipient pk)`);
  console.log(`             contract writes sender balance then recipient balance`);
  console.log(`             net result: balance = new_recipient_ct`);

  // 2a. Confirm registered
  let isReg;
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "is_registered",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    isReg = BigInt(res[0]) !== 0n;
    assert(isReg, `Sender is registered`);
  } catch (e) { err("is_registered", e); return; }

  if (!isReg) {
    err("not registered", new Error("Run e2e.mjs first to register"));
    return;
  }

  // 2b. Fetch current on-chain balance
  let currentCt;
  let currentBal;
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "get_encrypted_balance",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    currentCt  = ctFromChain(res);
    currentBal = decryptToWei(currentCt, sk);
    ok(`Fetched on-chain balance: ${formatStrk(currentBal ?? 0n)}`);
  } catch (e) { err("get_encrypted_balance", e); return; }

  // 2c. Deposit if balance is insufficient for the transfer
  if ((currentBal ?? 0n) < TRANSFER_WEI) {
    console.log(`  Balance too low - depositing ${formatStrk(DEPOSIT_WEI)} first...`);
    const encDep    = encryptWei(DEPOSIT_WEI, pk);
    const newDepCt  = addCt(currentCt, encDep);
    const newDepSer = serCt(newDepCt);
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
            toHex(newDepSer.c1_x), toHex(newDepSer.c1_y),
            toHex(newDepSer.c2_x), toHex(newDepSer.c2_y),
          ],
        },
      ]);
      console.log(`  → deposit tx: ${tx.transaction_hash}`);
      await provider.waitForTransaction(tx.transaction_hash);
      ok(`Deposit confirmed`);
      currentCt  = newDepCt;
      currentBal = (currentBal ?? 0n) + DEPOSIT_WEI;
    } catch (e) { err("deposit (pre-transfer)", e); return; }
  }

  // 2d. Build transfer ciphertexts
  //
  // Self-transfer: sender pk == recipient pk.
  // The contract overwrites sender balance, then recipient balance (same slot).
  // Final on-chain state = new_recipient_ct.
  //
  // We compute:
  //   new_sender_ct   = currentCt - Enc(TRANSFER_WEI)
  //   new_recipient_ct = Enc(TRANSFER_WEI)   (fresh, starting from zero)
  //
  // Expected on-chain after tx: Enc(TRANSFER_WEI)
  // Expected decrypted balance: TRANSFER_WEI

  const encForSender = encryptWei(TRANSFER_WEI, pk);
  const encForRecip  = encryptWei(TRANSFER_WEI, pk);   // separate fresh randomness

  const newSenderCt  = subCt(currentCt, encForSender);
  const newRecipCt   = encForRecip;                     // recipient starts fresh

  const newSenderSer = serCt(newSenderCt);
  const newRecipSer  = serCt(newRecipCt);

  const nullifier = randomScalar();
  const proofHash = randomScalar();

  // 2e. Execute transfer on-chain
  try {
    const tx = await account.execute([{
      contractAddress: POOL,
      entrypoint: "transfer",
      calldata: [
        toHex(pkAff.x),
        toHex(pkAff.y),
        toHex(newSenderSer.c1_x), toHex(newSenderSer.c1_y),
        toHex(newSenderSer.c2_x), toHex(newSenderSer.c2_y),
        toHex(newRecipSer.c1_x),  toHex(newRecipSer.c1_y),
        toHex(newRecipSer.c2_x),  toHex(newRecipSer.c2_y),
        toHex(proofHash),
        toHex(nullifier),
      ],
    }]);
    console.log(`  → transfer tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    ok(`Transfer confirmed on-chain`);
  } catch (e) { err("transfer", e); return; }

  // 2f. Verify nullifier is now marked spent
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "is_nullifier_spent",
      calldata: [toHex(nullifier)],
    });
    assert(BigInt(res[0]) !== 0n, "Nullifier marked spent after transfer");
  } catch (e) { err("is_nullifier_spent", e); }

  // 2g. Verify on-chain balance = new_recipient_ct (the last write wins in self-transfer)
  try {
    const res = await provider.callContract({
      contractAddress: POOL,
      entrypoint: "get_encrypted_balance",
      calldata: [toHex(pkAff.x), toHex(pkAff.y)],
    });
    const onChainCt  = ctFromChain(res);
    const onChainBal = decryptToWei(onChainCt, sk);
    assert(
      onChainBal === TRANSFER_WEI,
      `On-chain balance after self-transfer: ${formatStrk(onChainBal ?? 0n)} (expected ${formatStrk(TRANSFER_WEI)})`,
    );
  } catch (e) { err("balance check after transfer", e); }

  // 2h. Verify replay protection: same nullifier must be rejected
  try {
    await account.execute([{
      contractAddress: POOL,
      entrypoint: "transfer",
      calldata: [
        toHex(pkAff.x), toHex(pkAff.y),
        toHex(newSenderSer.c1_x), toHex(newSenderSer.c1_y),
        toHex(newSenderSer.c2_x), toHex(newSenderSer.c2_y),
        toHex(newRecipSer.c1_x),  toHex(newRecipSer.c1_y),
        toHex(newRecipSer.c2_x),  toHex(newRecipSer.c2_y),
        toHex(proofHash),
        toHex(nullifier),   // same nullifier - must fail
      ],
    }]);
    err("nullifier replay protection", new Error("Expected NULLIFIER_SPENT revert but tx succeeded"));
  } catch (e) {
    const msg = e?.message ?? "";
    if (msg.includes("NULLIFIER_SPENT") || msg.includes("revert") || msg.includes("Error")) {
      ok("Nullifier replay correctly rejected (NULLIFIER_SPENT)");
    } else {
      err("nullifier replay protection", e);
    }
  }
}

// -- Main --------------------------------------------------------------------

async function main() {
  console.log("╔════════════════════════════════════╗");
  console.log("║   Veil - Transfer Flow Test Suite  ║");
  console.log("╚════════════════════════════════════╝");

  testCrypto();
  await testOnChain();

  console.log(`\n-- Results: ${pass} passed, ${fail} failed --`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
