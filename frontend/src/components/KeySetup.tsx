"use client";

import { Shield, Key, AlertTriangle } from "lucide-react";
import type { ElGamalKeys } from "@/hooks/useElGamalKey";

interface KeySetupProps {
  keys: ElGamalKeys | null;
  onGenerate: () => void;
}

export default function KeySetup({ keys, onGenerate }: KeySetupProps) {
  if (keys) return null;

  return (
    <div className="glow-card rounded-2xl bg-card border border-border p-8 max-w-lg mx-auto">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
          <Key className="w-8 h-8 text-accent" />
        </div>

        <h2 className="text-xl font-semibold">Set Up Shielded Identity</h2>

        <p className="text-muted text-sm leading-relaxed max-w-sm">
          Generate an ElGamal encryption keypair. This key encrypts your
          balances so only you can see them. It stays in your browser — never
          sent to anyone.
        </p>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-dim border border-accent/20 text-xs text-accent w-full">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Back up your private key after generating. If you lose it, your
            shielded funds are unrecoverable.
          </span>
        </div>

        <button
          onClick={onGenerate}
          className="w-full mt-2 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-medium transition-colors"
        >
          <Shield className="w-4 h-4" />
          Generate Shielded Keypair
        </button>
      </div>
    </div>
  );
}
