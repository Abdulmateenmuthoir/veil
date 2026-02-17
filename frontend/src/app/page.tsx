"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { Shield, Loader2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import KeySetup from "@/components/KeySetup";
import KeyInfo from "@/components/KeyInfo";
import BalanceCard from "@/components/BalanceCard";
import ActionPanel from "@/components/ActionPanel";
import TxHistory, { type TxRecord } from "@/components/TxHistory";
import { useElGamalKey } from "@/hooks/useElGamalKey";
import { useShieldedBalance } from "@/hooks/useShieldedBalance";
import { useNonce } from "@/hooks/useNonce";
import { useShieldedPool } from "@/hooks/useShieldedPool";

export default function Home() {
  const { isConnected } = useAccount();
  const { keys, loading: keysLoading, generateKeys, clearKeys } = useElGamalKey();
  const {
    decryptedBalance,
    loading: balanceLoading,
    computeDeposit,
    computeTransfer,
    computeWithdraw,
    syncFromChain,
    updateLocal,
  } = useShieldedBalance(keys);
  const { nextNullifier, nextProofHash } = useNonce();
  const {
    register,
    deposit,
    transfer,
    withdraw,
    fetchBalance,
    checkRegistered,
  } = useShieldedPool();

  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regChecked, setRegChecked] = useState(false);

  // Check registration status + sync balance when keys are available.
  useEffect(() => {
    if (!keys || !isConnected) return;
    let cancelled = false;

    (async () => {
      try {
        const isReg = await checkRegistered(keys.publicKey.x, keys.publicKey.y);
        if (cancelled) return;
        setRegistered(isReg);
        setRegChecked(true);

        if (isReg) {
          const bal = await fetchBalance(keys.publicKey.x, keys.publicKey.y);
          if (!cancelled) {
            syncFromChain(bal.c1x, bal.c1y, bal.c2x, bal.c2y);
          }
        }
      } catch (err) {
        console.error("Failed to check registration / fetch balance:", err);
        if (!cancelled) setRegChecked(true);
      }
    })();

    return () => { cancelled = true; };
  }, [keys, isConnected, checkRegistered, fetchBalance, syncFromChain]);

  // Sync balance from chain after any on-chain operation.
  const refreshBalance = useCallback(async () => {
    if (!keys) return;
    try {
      const bal = await fetchBalance(keys.publicKey.x, keys.publicKey.y);
      syncFromChain(bal.c1x, bal.c1y, bal.c2x, bal.c2y);
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    }
  }, [keys, fetchBalance, syncFromChain]);

  const addTx = useCallback(
    (type: TxRecord["type"], amount: string, txHash?: string) => {
      setTransactions((prev) => [
        {
          id: crypto.randomUUID(),
          type,
          amount,
          timestamp: Date.now(),
          txHash,
        },
        ...prev,
      ]);
    },
    [],
  );

  // ── Handlers ──

  const handleRegister = useCallback(async () => {
    if (!keys) return;
    setRegistering(true);
    try {
      await register(keys.publicKey.x, keys.publicKey.y);
      setRegistered(true);
      await refreshBalance();
    } catch (err) {
      console.error("Registration failed:", err);
      throw err;
    } finally {
      setRegistering(false);
    }
  }, [keys, register, refreshBalance]);

  const handleDeposit = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("Keys not set up");
      const wei = parseEther(amount);
      const { newBalance, serialized } = computeDeposit(wei);

      const txHash = await deposit(wei, serialized);

      updateLocal(newBalance);
      addTx("deposit", amount, txHash);
      await refreshBalance();
    },
    [keys, computeDeposit, deposit, updateLocal, addTx, refreshBalance],
  );

  const handleWithdraw = useCallback(
    async (amount: string) => {
      if (!keys) throw new Error("Keys not set up");
      const wei = parseEther(amount);
      const nullifier = nextNullifier(keys.privateKey, "withdraw");
      const proofHash = nextProofHash(keys.privateKey, decryptedBalance, wei, nullifier);
      const { newBalance, serialized } = computeWithdraw(wei);

      const txHash = await withdraw(wei, serialized, proofHash, nullifier);

      updateLocal(newBalance);
      addTx("withdraw", amount, txHash);
      await refreshBalance();
    },
    [
      keys,
      decryptedBalance,
      computeWithdraw,
      withdraw,
      updateLocal,
      addTx,
      nextNullifier,
      nextProofHash,
      refreshBalance,
    ],
  );

  const handleTransfer = useCallback(
    async (recipientPkX: string, recipientPkY: string, amount: string) => {
      if (!keys) throw new Error("Keys not set up");
      const wei = parseEther(amount);
      const rpkX = BigInt(recipientPkX);
      const rpkY = BigInt(recipientPkY);

      // Fetch recipient's current on-chain balance so we add to it.
      const recipientBal = await fetchBalance(rpkX, rpkY);

      const nullifier = nextNullifier(keys.privateKey, "transfer");
      const proofHash = nextProofHash(keys.privateKey, decryptedBalance, wei, nullifier);
      const { newSenderBalance, senderSerialized, recipientSerialized } =
        computeTransfer(wei, rpkX, rpkY, recipientBal);

      const txHash = await transfer(
        rpkX,
        rpkY,
        senderSerialized,
        recipientSerialized,
        proofHash,
        nullifier,
      );

      updateLocal(newSenderBalance);
      addTx("transfer", amount, txHash);
      await refreshBalance();
    },
    [
      keys,
      decryptedBalance,
      computeTransfer,
      transfer,
      fetchBalance,
      updateLocal,
      addTx,
      nextNullifier,
      nextProofHash,
      refreshBalance,
    ],
  );

  // ── Render ──

  // Not connected.
  if (!isConnected) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <img src="/veil-logo.svg" alt="Veil" className="w-20 h-20 rounded-3xl mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-3">
              <span className="gradient-text">Private Transactions</span>
              <br />
              on Starknet
            </h1>
            <p className="text-muted text-sm leading-relaxed mb-8">
              Deposit, transfer, and withdraw ERC20 tokens with full
              confidentiality. Balances and amounts are encrypted using ElGamal
              and verified by STARK proofs.
            </p>
            <p className="text-sm text-muted">
              Connect your wallet to get started
            </p>
          </div>
        </main>
      </>
    );
  }

  // Loading keys.
  if (keysLoading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </main>
      </>
    );
  }

  // Connected but no ElGamal keys.
  if (!keys) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center px-4 pt-20">
          <KeySetup keys={keys} onGenerate={generateKeys} />
        </main>
      </>
    );
  }

  // Keys generated but not registered on-chain yet.
  if (regChecked && !registered) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center px-4 pt-20">
          <div className="glow-card rounded-2xl bg-card border border-border p-8 max-w-lg mx-auto text-center">
            <img src="/veil-logo.svg" alt="Veil" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Register On-Chain</h2>
            <p className="text-muted text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              Your encryption keypair is ready. Register your public key on the
              ShieldedPool contract so you can deposit, transfer, and withdraw
              privately.
            </p>

            <KeyInfo keys={keys} onClear={clearKeys} />

            <button
              onClick={handleRegister}
              disabled={registering}
              className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {registering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shield className="w-4 h-4" />
              )}
              {registering ? "Registering..." : "Register Shielded Identity"}
            </button>
          </div>
        </main>
      </>
    );
  }

  // Still checking registration.
  if (!regChecked) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted">Checking registration...</span>
          </div>
        </main>
      </>
    );
  }

  // Full dashboard.
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-24 pb-12 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <BalanceCard balance={decryptedBalance} loading={balanceLoading} />

          <ActionPanel
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
            onTransfer={handleTransfer}
            disabled={!keys}
          />

          <KeyInfo keys={keys} onClear={clearKeys} />

          <TxHistory transactions={transactions} />
        </div>
      </main>
    </>
  );
}

function parseEther(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = frac.padEnd(18, "0").slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded);
}
