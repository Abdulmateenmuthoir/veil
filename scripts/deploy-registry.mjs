/**
 * Veil — Deploy VeilNameRegistry to Starknet Sepolia
 *
 * Usage:
 *   1. Ensure .env has ACCOUNT_ADDRESS and PRIVATE_KEY
 *   2. Run `scarb build` in /contracts first
 *   3. node scripts/deploy-registry.mjs
 *
 * The SHIELDED_POOL_ADDRESS is read from scripts/deployed.json (written by deploy.mjs),
 * or override via SHIELDED_POOL env var.
 */

import { Account, RpcProvider, json, CallData } from "starknet";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ──

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// ShieldedPool address: from env, or from previously written deployed.json
let SHIELDED_POOL_ADDRESS = process.env.SHIELDED_POOL_ADDRESS;
if (!SHIELDED_POOL_ADDRESS) {
  const deployedPath = resolve(__dirname, "deployed.json");
  if (existsSync(deployedPath)) {
    const deployed = JSON.parse(readFileSync(deployedPath, "ascii"));
    SHIELDED_POOL_ADDRESS = deployed.contractAddress;
  }
}

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Missing ACCOUNT_ADDRESS or PRIVATE_KEY in .env");
  process.exit(1);
}
if (!SHIELDED_POOL_ADDRESS) {
  console.error(
    "Missing SHIELDED_POOL_ADDRESS. Set env var or run deploy.mjs first."
  );
  process.exit(1);
}

// ── Paths to compiled artifacts ──

const SIERRA_PATH = resolve(
  __dirname,
  "../contracts/target/dev/veil_VeilNameRegistry.contract_class.json"
);
const CASM_PATH = resolve(
  __dirname,
  "../contracts/target/dev/veil_VeilNameRegistry.compiled_contract_class.json"
);

async function main() {
  console.log("=== Veil Name Registry Deployment ===\n");

  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
  });

  const chainId = await provider.getChainId();
  console.log("Chain ID:", chainId);
  console.log("Deployer:", ACCOUNT_ADDRESS);
  console.log("ShieldedPool:", SHIELDED_POOL_ADDRESS);
  console.log();

  // Read compiled artifacts
  console.log("Reading compiled contract artifacts...");
  const sierra = json.parse(readFileSync(SIERRA_PATH, "ascii"));
  const casm = json.parse(readFileSync(CASM_PATH, "ascii"));

  // ── Step 1: Declare ──
  console.log("Declaring VeilNameRegistry class...");
  let classHash;
  try {
    const declareResponse = await account.declare({ contract: sierra, casm });
    classHash = declareResponse.class_hash;
    console.log("Declared! Class hash:", classHash);
    console.log("Tx hash:", declareResponse.transaction_hash);
    console.log("Waiting for declaration tx...");
    await provider.waitForTransaction(declareResponse.transaction_hash);
    console.log("Declaration confirmed.\n");
  } catch (err) {
    const errMsg = err.message || "";
    if (
      errMsg.includes("already declared") ||
      errMsg.includes("CLASS_ALREADY_DECLARED") ||
      errMsg.includes("already been declared")
    ) {
      const { hash } = await import("starknet");
      classHash = hash.computeContractClassHash(sierra);
      console.log("Contract already declared. Class hash:", classHash, "\n");
    } else {
      throw err;
    }
  }

  // ── Step 2: Deploy ──
  console.log("Deploying VeilNameRegistry instance...");
  const constructorCalldata = CallData.compile({
    shielded_pool: SHIELDED_POOL_ADDRESS,
  });

  const deployResponse = await account.deployContract({
    classHash,
    constructorCalldata,
  });

  console.log("Deploy tx hash:", deployResponse.transaction_hash);
  console.log("Waiting for deployment...");
  await provider.waitForTransaction(deployResponse.transaction_hash);

  const contractAddress = deployResponse.contract_address;
  console.log("\n========================================");
  console.log("VeilNameRegistry deployed at:", contractAddress);
  console.log("========================================\n");

  console.log("Next steps:");
  console.log(
    `  1. Update frontend/src/lib/constants.ts: VEIL_NAME_REGISTRY_ADDRESS = "${contractAddress}"`
  );
  console.log("  2. Restart the frontend: cd frontend && npm run dev");

  // Write deployed address to a file for easy reference
  writeFileSync(
    resolve(__dirname, "deployed-registry.json"),
    JSON.stringify(
      {
        network: "sepolia",
        chainId,
        contractAddress,
        classHash,
        shieldedPool: SHIELDED_POOL_ADDRESS,
        deployer: ACCOUNT_ADDRESS,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Deployment info saved to scripts/deployed-registry.json");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
