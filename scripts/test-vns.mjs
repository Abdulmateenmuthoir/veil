/**
 * Veil Name Service — End-to-End Test
 *
 * Tests the VeilNameRegistry contract on Sepolia:
 *   1. register_name (multicall with ShieldedPool.register if needed)
 *   2. resolve(name) → (pk_x, pk_y)
 *   3. get_name(address) → name
 *   4. is_name_taken(name) → true after registration
 *   5. NAME_TAKEN error on duplicate
 *   6. ADDRESS_ALREADY_NAMED error on second name claim
 *
 * Usage: cd scripts && node test-vns.mjs
 */

import { Account, RpcProvider, ec } from "starknet";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config();

// ── Config ───────────────────────────────────────────────────────────────────

const deployed = JSON.parse(readFileSync(resolve(__dirname, "deployed.json"), "utf8"));
const deployedReg = JSON.parse(readFileSync(resolve(__dirname, "deployed-registry.json"), "utf8"));
const POOL     = deployed.contractAddress;
const REGISTRY = deployedReg.contractAddress;
const RPC      = "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";
const KEYS_FILE = resolve(__dirname, "e2e-keys.json");

// Test name — use a fixed name so re-runs detect it's already taken.
const TEST_NAME = "veiltest";

// ── Felt252 short-string helpers ─────────────────────────────────────────────

function strToFelt252(s) {
  let result = 0n;
  for (const ch of s) result = result * 256n + BigInt(ch.charCodeAt(0));
  return result;
}

function felt252ToStr(felt) {
  if (felt === 0n) return "";
  const bytes = [];
  let n = felt;
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  return String.fromCharCode(...bytes);
}

function toHex(n) { return "0x" + n.toString(16); }

// ── Logging ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
function ok(label)         { console.log(`  ✓ ${label}`); pass++; }
function fail_(label, e)   { console.error(`  ✗ ${label}:`, e?.message ?? e); fail++; }
function section(s)        { console.log(`\n── ${s} ──`); }
function assert(cond, msg) { cond ? ok(msg) : (console.error(`  ✗ ${msg}`), fail++); }

// ── Main ─────────────────────────────────────────────────────────────────────

const G = ec.starkCurve.ProjectivePoint.BASE;

section("Veil Name Service — E2E Test");
console.log(`  Pool     : ${POOL}`);
console.log(`  Registry : ${REGISTRY}`);
console.log(`  Account  : ${process.env.ACCOUNT_ADDRESS}`);
console.log(`  Name     : ${TEST_NAME}.veil`);

const provider = new RpcProvider({ nodeUrl: RPC });
const account  = new Account({
  provider,
  address: process.env.ACCOUNT_ADDRESS,
  signer:  process.env.PRIVATE_KEY,
});

// Load persisted keypair (same one used by e2e.mjs).
if (!existsSync(KEYS_FILE)) {
  console.error("  e2e-keys.json not found — run e2e.mjs first to register in ShieldedPool");
  process.exit(1);
}
const saved = JSON.parse(readFileSync(KEYS_FILE, "utf8"));
const sk  = BigInt(saved.sk);
const pk  = G.multiply(sk);
const pkAff = pk.toAffine();
console.log(`  PK_X     : 0x${pkAff.x.toString(16).slice(0, 16)}...`);

// ── 1. Confirm ShieldedPool registration ─────────────────────────────────────

section("1. ShieldedPool registration check");
let isReg;
try {
  const res = await provider.callContract({
    contractAddress: POOL,
    entrypoint: "is_registered",
    calldata: [toHex(pkAff.x), toHex(pkAff.y)],
  });
  isReg = BigInt(res[0]) !== 0n;
  ok(`is_registered → ${isReg}`);
} catch (e) { fail_("is_registered", e); process.exit(1); }

if (!isReg) {
  // Should not happen if e2e.mjs was run, but handle gracefully.
  console.log("  Not yet registered in ShieldedPool — will do combined multicall");
}

// ── 2. Check if address already has a name ───────────────────────────────────

section("2. Existing name check");
let existingName = "";
try {
  const res = await provider.callContract({
    contractAddress: REGISTRY,
    entrypoint: "get_name",
    calldata: [process.env.ACCOUNT_ADDRESS],
  });
  existingName = felt252ToStr(BigInt(res[0]));
  if (existingName) {
    ok(`Address already has name: "${existingName}.veil" — skipping registration`);
  } else {
    ok("Address has no name yet — proceeding with registration");
  }
} catch (e) { fail_("get_name", e); }

// ── 3. Check is_name_taken before registration ───────────────────────────────

section("3. Name availability before registration");
const nameFelt = strToFelt252(TEST_NAME);
try {
  const res = await provider.callContract({
    contractAddress: REGISTRY,
    entrypoint: "is_name_taken",
    calldata: [toHex(nameFelt)],
  });
  const taken = BigInt(res[0]) !== 0n;
  if (existingName === TEST_NAME) {
    assert(taken, `"${TEST_NAME}.veil" correctly shows as taken (our registration)`);
  } else if (!existingName) {
    assert(!taken, `"${TEST_NAME}.veil" is available`);
  } else {
    ok(`"${TEST_NAME}.veil" taken=${taken} (address has different name "${existingName}.veil")`);
  }
} catch (e) { fail_("is_name_taken (before)", e); }

// ── 4. Register the name (skip if address already named) ─────────────────────

section("4. Name registration");
if (!existingName) {
  try {
    const calls = [];
    if (!isReg) {
      calls.push({
        contractAddress: POOL,
        entrypoint: "register",
        calldata: [toHex(pkAff.x), toHex(pkAff.y)],
      });
    }
    calls.push({
      contractAddress: REGISTRY,
      entrypoint: "register_name",
      calldata: [toHex(nameFelt), toHex(pkAff.x), toHex(pkAff.y)],
    });

    const tx = await account.execute(calls);
    console.log(`  → tx: ${tx.transaction_hash}`);
    await provider.waitForTransaction(tx.transaction_hash);
    ok(`register_name "${TEST_NAME}.veil" confirmed on-chain`);
    existingName = TEST_NAME;
  } catch (e) { fail_("register_name", e); }
} else {
  ok(`Skipped (address already owns "${existingName}.veil")`);
}

// ── 5. Resolve name → pk ─────────────────────────────────────────────────────

section("5. Name resolution");
try {
  const res = await provider.callContract({
    contractAddress: REGISTRY,
    entrypoint: "resolve",
    calldata: [toHex(strToFelt252(existingName || TEST_NAME))],
  });
  const resolvedX = BigInt(res[0]);
  const resolvedY = BigInt(res[1]);
  assert(resolvedX === pkAff.x, `resolve pk_x matches`);
  assert(resolvedY === pkAff.y, `resolve pk_y matches`);
  console.log(`  Resolved: 0x${resolvedX.toString(16).slice(0, 16)}...`);
} catch (e) { fail_("resolve", e); }

// ── 6. get_name(address) ─────────────────────────────────────────────────────

section("6. Reverse lookup");
try {
  const res = await provider.callContract({
    contractAddress: REGISTRY,
    entrypoint: "get_name",
    calldata: [process.env.ACCOUNT_ADDRESS],
  });
  const name = felt252ToStr(BigInt(res[0]));
  assert(name === (existingName || TEST_NAME), `get_name → "${name}.veil"`);
} catch (e) { fail_("get_name (after)", e); }

// ── 7. is_name_taken → true after registration ───────────────────────────────

section("7. Name availability after registration");
try {
  const res = await provider.callContract({
    contractAddress: REGISTRY,
    entrypoint: "is_name_taken",
    calldata: [toHex(strToFelt252(existingName || TEST_NAME))],
  });
  assert(BigInt(res[0]) !== 0n, `"${existingName || TEST_NAME}.veil" is_name_taken → true`);
} catch (e) { fail_("is_name_taken (after)", e); }

// ── 8. NAME_TAKEN error ───────────────────────────────────────────────────────

section("8. NAME_TAKEN rejection");
try {
  await account.execute([{
    contractAddress: REGISTRY,
    entrypoint: "register_name",
    calldata: [toHex(strToFelt252(existingName || TEST_NAME)), toHex(pkAff.x), toHex(pkAff.y)],
  }]);
  fail_("NAME_TAKEN", new Error("Expected revert but tx succeeded"));
} catch (e) {
  const msg = e?.message ?? "";
  if (msg.includes("NAME_TAKEN") || msg.includes("revert") || msg.includes("Error")) {
    ok(`NAME_TAKEN revert as expected`);
  } else {
    fail_("NAME_TAKEN", e);
  }
}

// ── 9. ADDRESS_ALREADY_NAMED error ───────────────────────────────────────────

section("9. ADDRESS_ALREADY_NAMED rejection");
const altName = "veiltest2";
try {
  await account.execute([{
    contractAddress: REGISTRY,
    entrypoint: "register_name",
    calldata: [toHex(strToFelt252(altName)), toHex(pkAff.x), toHex(pkAff.y)],
  }]);
  fail_("ADDRESS_ALREADY_NAMED", new Error("Expected revert but tx succeeded"));
} catch (e) {
  const msg = e?.message ?? "";
  if (msg.includes("ADDRESS_ALREADY_NAMED") || msg.includes("revert") || msg.includes("Error")) {
    ok(`ADDRESS_ALREADY_NAMED revert as expected`);
  } else {
    fail_("ADDRESS_ALREADY_NAMED", e);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(44)}`);
console.log(`VNS tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
