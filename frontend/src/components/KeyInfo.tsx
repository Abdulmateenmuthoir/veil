"use client";

import { useState } from "react";
import { Copy, Check, Key, Trash2 } from "lucide-react";
import type { ElGamalKeys } from "@/hooks/useElGamalKey";

interface KeyInfoProps {
  keys: ElGamalKeys;
  onClear: () => void;
}

export default function KeyInfo({ keys, onClear }: KeyInfoProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showSk, setShowSk] = useState(false);

  const pkX = `0x${keys.publicKey.x.toString(16)}`;
  const pkY = `0x${keys.publicKey.y.toString(16)}`;
  const sk = `0x${keys.privateKey.toString(16)}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="glow-card rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">Shielded Identity</span>
        </div>
        <button
          onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors text-muted hover:text-danger"
          title="Clear keys"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {/* Public Key X */}
        <div>
          <div className="text-xs text-muted mb-1">Public Key X</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono truncate bg-background px-3 py-1.5 rounded-lg border border-border">
              {pkX}
            </code>
            <button
              onClick={() => copy(pkX, "pkx")}
              className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted"
            >
              {copied === "pkx" ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Public Key Y */}
        <div>
          <div className="text-xs text-muted mb-1">Public Key Y</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono truncate bg-background px-3 py-1.5 rounded-lg border border-border">
              {pkY}
            </code>
            <button
              onClick={() => copy(pkY, "pky")}
              className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted"
            >
              {copied === "pky" ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Private Key (hidden by default) */}
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-1">
            <span>Private Key</span>
            <button
              onClick={() => setShowSk(!showSk)}
              className="text-accent hover:underline"
            >
              {showSk ? "hide" : "reveal"}
            </button>
          </div>
          {showSk && (
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono truncate bg-background px-3 py-1.5 rounded-lg border border-danger/30">
                {sk}
              </code>
              <button
                onClick={() => copy(sk, "sk")}
                className="p-1.5 rounded-lg hover:bg-card-hover transition-colors text-muted"
              >
                {copied === "sk" ? (
                  <Check className="w-3.5 h-3.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
