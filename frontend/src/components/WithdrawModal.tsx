"use client";

import { useState } from "react";
import { ArrowUpFromLine, Loader2 } from "lucide-react";
import Modal from "./Modal";

interface WithdrawModalProps {
  onClose: () => void;
  onSubmit: (amount: string) => Promise<void>;
}

export default function WithdrawModal({ onClose, onSubmit }: WithdrawModalProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await onSubmit(amount);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Withdraw" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted mb-1.5 block">Amount</label>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-accent focus:outline-none text-lg font-mono placeholder:text-muted/40"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
              STRK
            </span>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-accent-dim border border-accent/20 text-xs text-muted space-y-1">
          <div className="flex justify-between">
            <span>Action</span>
            <span className="text-foreground">Decrypt + release tokens</span>
          </div>
          <div className="flex justify-between">
            <span>Note</span>
            <span className="text-accent">Withdrawal amount is public</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !amount}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUpFromLine className="w-4 h-4" />
          )}
          {loading ? "Unshielding..." : "Unshield Tokens"}
        </button>
      </div>
    </Modal>
  );
}
