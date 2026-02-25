"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Send, Clock, Inbox, ChevronDown, ChevronUp } from "lucide-react";

const PAGE_SIZE = 3;

export interface TxRecord {
  id: string;
  type: "deposit" | "transfer" | "withdraw" | "receive";
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
  receive: Inbox,
};

const labels = {
  deposit: "Shielded",
  transfer: "Sent privately",
  withdraw: "Unshielded",
  receive: "Received privately",
};

export default function TxHistory({ transactions }: TxHistoryProps) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = transactions.slice(0, visible);
  const hasMore = visible < transactions.length;

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
        {shown.map((tx) => {
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
                  {tx.type === "deposit" || tx.type === "receive" ? "+" : "-"}
                  {tx.amount} STRK
                </div>
                {tx.txHash && (
                  <a
                    href={`https://sepolia.voyager.online/tx/${tx.txHash}`}
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

      {hasMore && (
        <button
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        >
          <ChevronDown className="w-4 h-4" />
          Show more ({transactions.length - visible} remaining)
        </button>
      )}

      {!hasMore && transactions.length > PAGE_SIZE && (
        <button
          onClick={() => setVisible(PAGE_SIZE)}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
          Show less
        </button>
      )}
    </div>
  );
}
