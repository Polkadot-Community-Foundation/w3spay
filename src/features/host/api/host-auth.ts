// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * `useHostAuth` — legacy shim over the `useHostWallet` auto-initing store.
 * Projects the new `HostWalletState` union into the historical `HostAuthState`
 * that `payment-flow-context.tsx` and the customer flow still depend on. New
 * code SHOULD consume `useHostWallet` directly for the full state.
 */
import { useHostWallet, type HostWalletState as NewState } from "@/shared/api/host";
import { envConfig } from "@/config";

/** Legacy host-auth state union, kept for the customer-flow consumers. */
export type HostAuthState =
  | { kind: "pending" }
  | { kind: "outsideHost" }
  | { kind: "disconnected" }
  | { kind: "connected" }
  | { kind: "error"; reason: string };

export interface UseHostAuthResult {
  state: HostAuthState;
}

/** Project the new store's state into the historical `HostAuthState`. */
export function useHostAuth(): UseHostAuthResult {
  // The host validates the product by the URL the webview/iframe is loaded
  // from, so this must match its derivation exactly.
  const productIdentifier = envConfig.host.productDotNs;
  const wallet = useHostWallet({
    productIdentifier,
    derivationIndex: envConfig.host.productDerivationIndex,
  });
  console.info("[useProductAccount] wallet state:", wallet.state);
  console.info("[useProductAccount] wallet address:", wallet.address);
  return { state: projectAuthState(wallet.state) };
}

function projectAuthState(s: NewState): HostAuthState {
  switch (s.kind) {
    case "outside-host":
      return { kind: "outsideHost" };
    case "ready":
      return { kind: "connected" };
    case "requesting-access":
      return { kind: "disconnected" };
    case "error":
      return { kind: "error", reason: s.reason };
    case "pending":
    case "resolving":
      return { kind: "pending" };
    default: {
      const _exhaustive: never = s;
      void _exhaustive;
      return { kind: "pending" };
    }
  }
}
