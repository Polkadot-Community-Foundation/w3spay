// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Resolve the narrow `PaymentHost` exposed by the surrounding Polkadot host
 * (Desktop webview / iframe / native mobile) via the product-sdk Host API,
 * as a TanStack Query.
 *
 */

import { useRef } from "react";

import { useQuery } from "@tanstack/react-query";
import { isDevStandalone, isInHost, useHostWalletSnapshot } from "@/shared/api/host";

import { envConfig } from "@/config";
import { hostKeys } from "@/features/host/api/keys.ts";
import { getDevPaymentHost } from "@/features/host/lib/dev-payment-host.ts";
import {
  resolvePaymentHost,
  type PaymentHost,
} from "@/features/host/lib/payment-host.ts";

export type CoinPaymentHostStatus = "pending" | "ready" | "timeout";

export interface CoinPaymentHostResult {
  readonly host: PaymentHost | null;
  readonly status: CoinPaymentHostStatus;
}

/**
 * Pure status reducer — exported so the transition table is testable without
 * React or wall-clock waits. `timeoutMs <= 0` is treated as timed-out
 * immediately, keeping the function total.
 */
export function coinPaymentHostStatus(
  resolvedHost: PaymentHost | null,
  elapsedMs: number,
  timeoutMs: number,
): CoinPaymentHostStatus {
  if (resolvedHost !== null) return "ready";
  if (elapsedMs >= timeoutMs) return "timeout";
  return "pending";
}

const PENDING: CoinPaymentHostResult = { host: null, status: "pending" };

export function useCoinPaymentHost(): CoinPaymentHostResult {
  // Reading the wallet snapshot gates the standard Host API branch on the
  // product-account resolution completing and re-renders us (and thus
  // refreshes the query fn closure) when `isReady` flips.
  const wallet = useHostWalletSnapshot();

  // Boot timestamp survives the poll cycle; only the first render's value
  // is retained (StrictMode re-mount simply restarts the budget).
  const startedAtRef = useRef<number>(Date.now());

  // 15s budget inside a real container (iOS webview-port bring-up); much
  // shorter standalone before we hand the dev host over.
  const timeoutMs = isInHost()
    ? envConfig.host.waitTimeoutMs
    : envConfig.host.standaloneWaitTimeoutMs;

  const query = useQuery<CoinPaymentHostResult>({
    queryKey: hostKeys.coinPaymentHost(),
    queryFn: () => {
      const host = resolvePaymentHost({
        devStandalone: false,
        hosted: isInHost(),
        hostApiReady: wallet.isReady,
        getDevHost: getDevPaymentHost,
      });
      if (host !== null) return { host, status: "ready" };
      if (wallet.isInitializing) return PENDING;
      const status = coinPaymentHostStatus(
        null,
        Date.now() - startedAtRef.current,
        timeoutMs,
      );
      if (status === "timeout") {
        // Re-check the dev gate after the wait — in dev standalone the
        // in-memory reference keeps the local loop usable; in production
        // a missing bridge becomes `hostUnavailable` upstream.
        return isDevStandalone()
          ? { host: getDevPaymentHost(), status: "ready" }
          : { host: null, status: "timeout" };
      }
      return PENDING;
    },
    // Keep polling only while unresolved; stop on ready/timeout.
    refetchInterval: (q) =>
      q.state.data?.status === "pending" ? envConfig.host.pollIntervalMs : false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return query.data ?? PENDING;
}
