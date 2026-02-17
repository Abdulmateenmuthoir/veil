"use client";

import { sepolia } from "@starknet-react/chains";
import { StarknetConfig, jsonRpcProvider, argent, braavos } from "@starknet-react/core";
import { type ReactNode } from "react";

const chains = [sepolia];
const connectors = [argent(), braavos()];

const provider = jsonRpcProvider({
  rpc: () => ({
    nodeUrl: "https://starknet-sepolia.infura.io/v3/be6b7a09f96f42b8ad45edfbeef94df5",
  }),
});

export default function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={chains}
      provider={provider}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  );
}
