"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Send } from "lucide-react";
import DepositModal from "./DepositModal";
import WithdrawModal from "./WithdrawModal";
import TransferModal from "./TransferModal";

type ModalType = "deposit" | "withdraw" | "transfer" | null;

interface ActionPanelProps {
  onDeposit: (amount: string) => Promise<void>;
  onWithdraw: (amount: string) => Promise<void>;
  onTransfer: (recipientPkX: string, recipientPkY: string, amount: string) => Promise<void>;
  disabled: boolean;
  shieldedBalance: bigint;
}

export default function ActionPanel({
  onDeposit,
  onWithdraw,
  onTransfer,
  disabled,
  shieldedBalance,
}: ActionPanelProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  const actions = [
    {
      id: "deposit" as const,
      label: "Deposit",
      icon: ArrowDownToLine,
      desc: "Shield tokens",
    },
    {
      id: "transfer" as const,
      label: "Transfer",
      icon: Send,
      desc: "Send privately",
    },
    {
      id: "withdraw" as const,
      label: "Withdraw",
      icon: ArrowUpFromLine,
      desc: "Unshield tokens",
    },
  ];

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        {actions.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setActiveModal(id)}
            disabled={disabled}
            className="glow-card rounded-2xl bg-card border border-border p-5 flex flex-col items-center gap-3 hover:border-accent/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
              <Icon className="w-5 h-5 text-accent" />
            </div>
            <div className="text-center">
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-muted mt-0.5">{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {activeModal === "deposit" && (
        <DepositModal
          onClose={() => setActiveModal(null)}
          onSubmit={onDeposit}
        />
      )}
      {activeModal === "withdraw" && (
        <WithdrawModal
          onClose={() => setActiveModal(null)}
          onSubmit={onWithdraw}
          balance={shieldedBalance}
        />
      )}
      {activeModal === "transfer" && (
        <TransferModal
          onClose={() => setActiveModal(null)}
          onSubmit={onTransfer}
          balance={shieldedBalance}
        />
      )}
    </>
  );
}
