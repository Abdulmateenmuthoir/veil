"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect } from "react";

const StarknetProvider = dynamic(() => import("@/providers/StarknetProvider"), {
  ssr: false,
});

/**
 * Suppress errors from non-Starknet browser extensions (MetaMask, etc.)
 * that inject into the page and conflict with window.ethereum.
 */
function useExtensionErrorSuppressor() {
  useEffect(() => {
    const originalOnError = window.onerror;

    window.onerror = (message, source, lineno, colno, error) => {
      // Suppress errors originating from browser extensions
      if (typeof source === "string" && source.includes("chrome-extension://")) {
        return true;
      }
      if (originalOnError) {
        return originalOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const stack = event.reason?.stack || "";
      const msg = event.reason?.message || "";
      if (
        stack.includes("chrome-extension://") ||
        msg.includes("MetaMask") ||
        msg.includes("ethereum")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.onerror = originalOnError;
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
}

export default function ClientProviders({ children }: { children: ReactNode }) {
  useExtensionErrorSuppressor();
  return <StarknetProvider>{children}</StarknetProvider>;
}
