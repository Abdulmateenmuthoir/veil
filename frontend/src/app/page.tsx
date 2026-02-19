"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAccount } from "@starknet-react/core";
import { CheckCircle2, XCircle, Loader2, Shield, AtSign } from "lucide-react";
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
import { useVeilName, validateVeilName } from "@/hooks/useVeilName";

export default function Home() {
  const { isConnected, account } = useAccount();
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
    registerWithName,
    deposit,
    transfer,
    withdraw,
    fetchBalance,
    checkRegistered,
  } = useShieldedPool();
  const { checkNameAvailable, getNameForAddress } = useVeilName();

  const [transactions, setTransactions] = useState<TxRecord[]>([]);
  const [registered, setRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [regChecked, setRegChecked] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // VNS state
  const [veilName, setVeilName] = useState("");
  const [nameStatus, setNameStatus] = useState<
    "idle" | "invalid" | "checking" | "available" | "taken"
  >("idle");
  const [myVeilName, setMyVeilName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fetch the user's .veil name when they are registered.
  useEffect(() => {
    if (!registered || !account?.address) return;
    getNameForAddress(account.address)
      .then((name) => { if (name) setMyVeilName(name); })
      .catch(() => {});
  }, [registered, account?.address, getNameForAddress]);

  // Debounced name availability check.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!veilName) {
      setNameStatus("idle");
      return;
    }
    if (!validateVeilName(veilName)) {
      setNameStatus("invalid");
      return;
    }
    setNameStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const available = await checkNameAvailable(veilName);
        setNameStatus(available ? "available" : "taken");
      } catch {
        setNameStatus("idle");
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [veilName, checkNameAvailable]);

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
    if (!keys || nameStatus !== "available") return;
    setRegistering(true);
    setRegError(null);
    try {
      await registerWithName(keys.publicKey.x, keys.publicKey.y, veilName);
      setRegistered(true);
      setMyVeilName(veilName);
      await refreshBalance();
    } catch (err) {
      console.error("Registration failed:", err);
      // Transaction may have landed on-chain even if waitForTransaction threw.
      // Re-check registration status before showing the error.
      try {
        const isReg = await checkRegistered(keys.publicKey.x, keys.publicKey.y);
        if (isReg) {
          setRegistered(true);
          setMyVeilName(veilName);
          await refreshBalance();
          return;
        }
      } catch {
        // ignore secondary check failure
      }
      const msg = err instanceof Error ? err.message : String(err);
      setRegError(msg);
    } finally {
      setRegistering(false);
    }
  }, [keys, nameStatus, veilName, registerWithName, checkRegistered, refreshBalance]);

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
      if (wei > decryptedBalance) throw new Error("Amount exceeds shielded balance");
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
      if (wei > decryptedBalance) throw new Error("Amount exceeds shielded balance");

      let rpkX: bigint, rpkY: bigint;
      try {
        rpkX = BigInt(recipientPkX);
        rpkY = BigInt(recipientPkY);
      } catch {
        throw new Error("Invalid recipient public key format");
      }

      // Verify recipient is registered before spending gas.
      const isRecipientReg = await checkRegistered(rpkX, rpkY);
      if (!isRecipientReg) throw new Error("Recipient is not registered on Veil");

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
      checkRegistered,
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
    const nameStatusIcon = () => {
      if (nameStatus === "checking") return <Loader2 className="w-4 h-4 animate-spin text-muted" />;
      if (nameStatus === "available") return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      if (nameStatus === "taken") return <XCircle className="w-4 h-4 text-red-400" />;
      if (nameStatus === "invalid") return <XCircle className="w-4 h-4 text-red-400" />;
      return null;
    };

    const nameHint = () => {
      if (nameStatus === "available") return <span className="text-green-400">{veilName}.veil is available</span>;
      if (nameStatus === "taken") return <span className="text-red-400">Name already taken</span>;
      if (nameStatus === "invalid") return <span className="text-red-400">3–31 chars, lowercase letters, numbers, hyphens only</span>;
      return <span className="text-muted">Choose your .veil identity (e.g. "pious")</span>;
    };

    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center px-4 pt-20">
          <div className="glow-card rounded-2xl bg-card border border-border p-8 max-w-lg mx-auto text-center">
            <img src="/veil-logo.svg" alt="Veil" className="w-16 h-16 rounded-2xl mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Claim Your .veil Identity</h2>
            <p className="text-muted text-sm leading-relaxed mb-6 max-w-sm mx-auto">
              Pick a name like <span className="text-accent font-mono">pious.veil</span> — others can
              send to you privately using just this name.
            </p>

            {/* Name input */}
            <div className="mb-6 text-left">
              <label className="text-sm text-muted mb-1.5 block">Your .veil name</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <AtSign className="w-4 h-4 text-muted" />
                </div>
                <input
                  type="text"
                  value={veilName}
                  onChange={(e) => setVeilName(e.target.value.toLowerCase())}
                  placeholder="pious"
                  maxLength={31}
                  className="w-full pl-10 pr-20 py-3 rounded-xl bg-background border border-border focus:border-accent focus:outline-none text-sm font-mono placeholder:text-muted/40"
                />
                <div className="absolute right-14 top-1/2 -translate-y-1/2">
                  {nameStatusIcon()}
                </div>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted font-mono">
                  .veil
                </div>
              </div>
              <p className="mt-1.5 text-xs">{nameHint()}</p>
            </div>

            <KeyInfo keys={keys} onClear={clearKeys} />

            {regError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 text-left break-all">
                <span className="font-medium">Registration failed: </span>{regError}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={registering || nameStatus !== "available"}
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
          {/* .veil identity banner */}
          {myVeilName && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/20">
              <AtSign className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="text-sm font-mono text-accent font-medium">{myVeilName}.veil</span>
              <span className="text-xs text-muted ml-auto">your shielded identity</span>
            </div>
          )}

          <BalanceCard balance={decryptedBalance} loading={balanceLoading} />

          <ActionPanel
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
            onTransfer={handleTransfer}
            disabled={!keys}
            shieldedBalance={decryptedBalance}
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
