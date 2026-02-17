"use client";

import { Shield, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface BalanceCardProps {
  balance: bigint;
  loading: boolean;
}

export default function BalanceCard({ balance, loading }: BalanceCardProps) {
  const [visible, setVisible] = useState(false);

  const formatted = formatBalance(balance);

  return (
    <div className="glow-card rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent shield-pulse" />
          <span className="text-sm text-muted">Shielded Balance</span>
        </div>
        <button
          onClick={() => setVisible(!visible)}
          className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex items-baseline gap-2">
        {loading ? (
          <div className="h-10 w-48 rounded-lg bg-border animate-pulse" />
        ) : (
          <>
            <span className="text-4xl font-bold tracking-tight font-mono">
              {visible ? formatted : "••••••"}
            </span>
            <span className="text-muted text-sm">STRK</span>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        <div className="w-1.5 h-1.5 rounded-full bg-success" />
        <span>Encrypted on-chain — only you can decrypt</span>
      </div>
    </div>
  );
}

function formatBalance(wei: bigint): string {
  // Display as whole units assuming 18 decimals.
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fracStr}`;
}
