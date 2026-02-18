"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";
import Modal from "./Modal";

interface TransferModalProps {
  onClose: () => void;
  onSubmit: (recipientPkX: string, recipientPkY: string, amount: string) => Promise<void>;
  balance: bigint;
}

function formatWei(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

export default function TransferModal({ onClose, onSubmit, balance }: TransferModalProps) {
  const [recipientPkX, setRecipientPkX] = useState("");
  const [recipientPkY, setRecipientPkY] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!recipientPkX || !recipientPkY) {
      setError("Enter recipient's public key");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    const [whole, frac = ""] = amount.split(".");
    const fracPadded = frac.padEnd(18, "0").slice(0, 18);
    const wei = BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded);
    if (wei > balance) {
      setError("Amount exceeds your shielded balance");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onSubmit(recipientPkX, recipientPkY, amount);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Private Transfer" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted mb-1.5 block">
            Recipient Public Key (X)
          </label>
          <input
            type="text"
            value={recipientPkX}
            onChange={(e) => setRecipientPkX(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-accent focus:outline-none text-sm font-mono placeholder:text-muted/40"
          />
        </div>

        <div>
          <label className="text-sm text-muted mb-1.5 block">
            Recipient Public Key (Y)
          </label>
          <input
            type="text"
            value={recipientPkY}
            onChange={(e) => setRecipientPkY(e.target.value)}
            placeholder="0x..."
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-accent focus:outline-none text-sm font-mono placeholder:text-muted/40"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-muted">Amount</label>
            <span className="text-xs text-muted">
              Available: <span className="text-foreground font-mono">{formatWei(balance)} STRK</span>
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-accent focus:outline-none text-lg font-mono placeholder:text-muted/40"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAmount(formatWei(balance))}
                className="text-xs text-accent hover:text-accent-hover font-medium"
              >
                MAX
              </button>
              <span className="text-sm text-muted">STRK</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-accent-dim border border-accent/20 text-xs text-muted space-y-1">
          <div className="flex justify-between">
            <span>Privacy</span>
            <span className="text-accent">Amount hidden from everyone</span>
          </div>
          <div className="flex justify-between">
            <span>Verified by</span>
            <span className="text-foreground">STARK proof</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !amount || !recipientPkX || !recipientPkY}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {loading ? "Sending..." : "Send Privately"}
        </button>
      </div>
    </Modal>
  );
}
