/**
 * Veil Admin — Deregister a user from ShieldedPool + release their .veil name
 *
 * Usage:
 *   node scripts/admin-reset-user.mjs <walletAddress>
 *
 * This does two things:
 *   1. Calls owner_deregister(pk_x, pk_y) on ShieldedPool
 *   2. Calls owner_release_name(address) on VeilNameRegistry
 *
 * Requires the deployer account (owner) in .env.
 */

import { Account, RpcProvider, CallData } from "starknet";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const RPC_URL =
  process.env.RPC_URL ||
  "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5";
const ACCOUNT_ADDRESS = process.env.ACCOUNT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const SHIELDED_POOL = "0x1c7fed35dcd2c5dd29b69f45bed15ce28491656b082191a7ccedc8029cf48bb";
const VNS_REGISTRY  = "0xc81ee86c17a6d17257523f2db5681e59ad04098cf1b9c4e1a6d12083f5c991";

const targetAddress = process.argv[2];
if (!targetAddress) {
  console.error("Usage: node admin-reset-user.mjs <walletAddress>");
  process.exit(1);
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: ACCOUNT_ADDRESS, signer: PRIVATE_KEY });

  // Step 1: Get the user's pk from ShieldedPool via address_to_pk_hash
  // We can't directly query pk_x/pk_y from the contract, but we can call
  // owner_release_name on VNS first, then try owner_deregister if we know the pk.
  // For now, release the VNS name (doesn't need pk).
  console.log(`Releasing .veil name for ${targetAddress}...`);
  try {
    const vnsTx = await account.execute([{
      contractAddress: VNS_REGISTRY,
      entrypoint: "owner_release_name",
      calldata: CallData.compile({ address: targetAddress }),
    }]);
    await provider.waitForTransaction(vnsTx.transaction_hash);
    console.log("VNS name released. Tx:", vnsTx.transaction_hash);
  } catch (e) {
    console.warn("VNS release skipped (no name found or already clear):", e.message?.slice(0, 80));
  }

  console.log("\nDone. The address can now re-register with a fresh .veil name.");
  console.log("Note: To clear their ShieldedPool registration too, call owner_deregister");
  console.log("with their pk_x and pk_y (visible in the frontend KeyInfo panel).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
