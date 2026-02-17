/**
 * Veil — Deploy ShieldedPool to Starknet Sepolia
 *
 * Usage:
 *   1. Copy .env.example → .env and fill in your account details
 *   2. npm install
 *   3. npm run deploy
 *
 * Prerequisites:
 *   - A Starknet Sepolia account with testnet ETH
 *   - Contract compiled via `scarb build` in /contracts
 */

import { Account, RpcProvider, json, CallData } from "starknet";
import { readFileSync, writeFileSync } from "fs";
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
const ERC20_TOKEN_ADDRESS =
  process.env.ERC20_TOKEN_ADDRESS ||
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"; // Sepolia ETH

if (!ACCOUNT_ADDRESS || !PRIVATE_KEY) {
  console.error("Missing ACCOUNT_ADDRESS or PRIVATE_KEY in .env");
  process.exit(1);
}

// ── Paths to compiled artifacts ──

const SIERRA_PATH = resolve(
  __dirname,
  "../contracts/target/dev/veil_ShieldedPool.contract_class.json"
);
const CASM_PATH = resolve(
  __dirname,
  "../contracts/target/dev/veil_ShieldedPool.compiled_contract_class.json"
);

async function main() {
  console.log("=== Veil ShieldedPool Deployment ===\n");

  // Provider + Account (starknet.js v9 options-based constructors)
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({
    provider,
    address: ACCOUNT_ADDRESS,
    signer: PRIVATE_KEY,
  });

  const chainId = await provider.getChainId();
  console.log("Chain ID:", chainId);
  console.log("Deployer:", ACCOUNT_ADDRESS);
  console.log("ERC20 token:", ERC20_TOKEN_ADDRESS);
  console.log();

  // Read compiled artifacts
  console.log("Reading compiled contract artifacts...");
  const sierra = json.parse(readFileSync(SIERRA_PATH, "ascii"));
  const casm = json.parse(readFileSync(CASM_PATH, "ascii"));

  // ── Step 1: Declare ──
  console.log("Declaring contract class...");
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
    // If already declared, extract class hash from error
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
  console.log("Deploying contract instance...");
  const constructorCalldata = CallData.compile({
    token: ERC20_TOKEN_ADDRESS,
    owner: ACCOUNT_ADDRESS,
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
  console.log("ShieldedPool deployed at:", contractAddress);
  console.log("========================================\n");

  console.log("Next steps:");
  console.log(
    `  1. Update frontend/src/lib/constants.ts with: "${contractAddress}"`
  );
  console.log("  2. Run the frontend: cd frontend && npm run dev");

  // Write deployed address to a file for easy reference
  writeFileSync(
    resolve(__dirname, "deployed.json"),
    JSON.stringify(
      {
        network: "sepolia",
        chainId,
        contractAddress,
        classHash,
        erc20Token: ERC20_TOKEN_ADDRESS,
        deployer: ACCOUNT_ADDRESS,
        timestamp: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log("Deployment info saved to scripts/deployed.json");
}

main().catch((err) => {
  console.error("Deployment failed:", err);
  process.exit(1);
});
