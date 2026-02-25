"use client";

import { Shield, Key, Loader2, RefreshCw } from "lucide-react";
import type { ElGamalKeys } from "@/hooks/useElGamalKey";

interface KeySetupProps {
  keys: ElGamalKeys | null;
  onGenerate: () => void;
  deriving?: boolean;
  deriveError?: string | null;
}

export default function KeySetup({ keys, onGenerate, deriving, deriveError }: KeySetupProps) {
  if (keys) return null;

  return (
    <div className="glow-card rounded-2xl bg-card border border-border p-8 max-w-lg mx-auto">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Key className="w-8 h-8 text-accent" />
        </div>

        <h2 className="text-xl font-semibold">Set Up Shielded Identity</h2>

        <p className="text-muted text-sm leading-relaxed max-w-sm">
          Your encryption key is derived from a one-time wallet signature.
          The same wallet always produces the same key — so you can recover
          your account on any device, anytime.
        </p>

        {/* Steps */}
        <div className="w-full space-y-2 text-left">
          {[
            { step: "1", text: "Your wallet signs a fixed message (never submitted on-chain)" },
            { step: "2", text: "The signature is hashed into your ElGamal private key" },
            { step: "3", text: "Same wallet → same key, always — no backup needed" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-background border border-border">
              <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step}
              </span>
              <span className="text-xs text-muted">{text}</span>
            </div>
          ))}
        </div>

        {deriveError && (
          <div className="w-full p-3 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger text-left">
            {deriveError.includes("reject") || deriveError.includes("cancel")
              ? "Signature cancelled — click below to try again."
              : deriveError}
          </div>
        )}

        <button
          onClick={onGenerate}
          disabled={deriving}
          className="w-full mt-2 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {deriving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for wallet signature…
            </>
          ) : deriveError ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Try Again
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              Derive Shielded Key from Wallet
            </>
          )}
        </button>
      </div>
    </div>
  );
}
