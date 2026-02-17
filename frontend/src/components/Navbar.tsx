"use client";

import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { Shield, LogOut, Wallet } from "lucide-react";

export default function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-accent" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Veil</span>
          <span className="text-xs text-muted px-2 py-0.5 rounded-full border border-border">
            Sepolia
          </span>
        </div>

        {/* Wallet */}
        <div>
          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-sm">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="font-mono text-sm">{shortAddress}</span>
              </div>
              <button
                onClick={() => disconnect()}
                className="p-2 rounded-lg hover:bg-card transition-colors text-muted hover:text-foreground"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => connect({ connector })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  {connector.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
