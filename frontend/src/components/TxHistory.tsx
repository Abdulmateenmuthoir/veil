"use client";

import { ArrowDownToLine, ArrowUpFromLine, Send, Clock } from "lucide-react";

export interface TxRecord {
  id: string;
  type: "deposit" | "transfer" | "withdraw";
  amount: string;
  timestamp: number;
  txHash?: string;
}

interface TxHistoryProps {
  transactions: TxRecord[];
}

const icons = {
  deposit: ArrowDownToLine,
  transfer: Send,
  withdraw: ArrowUpFromLine,
};

const labels = {
  deposit: "Shielded",
  transfer: "Sent privately",
  withdraw: "Unshielded",
};

export default function TxHistory({ transactions }: TxHistoryProps) {
  if (transactions.length === 0) {
    return (
      <div className="glow-card rounded-2xl bg-card border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-muted" />
          <span className="text-sm font-medium">Activity</span>
        </div>
        <p className="text-sm text-muted text-center py-6">
          No shielded transactions yet
        </p>
      </div>
    );
  }

  return (
    <div className="glow-card rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-muted" />
        <span className="text-sm font-medium">Activity</span>
      </div>

      <div className="space-y-3">
        {transactions.map((tx) => {
          const Icon = icons[tx.type];
          return (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3 rounded-xl bg-background border border-border"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <div className="text-sm font-medium">{labels[tx.type]}</div>
                  <div className="text-xs text-muted">
                    {new Date(tx.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">
                  {tx.type === "withdraw" ? "-" : "+"}
                  {tx.amount} STRK
                </div>
                {tx.txHash && (
                  <a
                    href={`https://sepolia.starkscan.co/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    View tx
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
