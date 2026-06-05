// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * W3SPay vault spendable balance, as a TanStack Query. Stays disabled
 * (`idle`) until `useCoinPaymentHost()` resolves a host; `refresh()`
 * invalidates the cache so post-payment paths re-read. A fetch failure
 * surfaces as `error` so routing can fall back to the dummy balance rather
 * than shipping an undercount.
 */

import { useCallback } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { PaymentHostBalance } from "@/features/host/lib/payment-host.ts";
import { useCoinPaymentHost } from "@/features/host/api/coin-payment-host.ts";
import { hostKeys } from "@/features/host/api/keys.ts";
import { envConfig } from "@/config";
import { runExclusiveHostModal } from "@/shared/api/host";

export type PaymentBalanceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; balance: PaymentHostBalance }
  | { kind: "error"; reason: string };

export interface UsePaymentBalanceResult {
  state: PaymentBalanceState;
  /** Re-fetch the balance. Use after a successful payment or top-up. */
  refresh: () => void;
}
/** How long to wait for the host's balance subscription before failing. */
const BALANCE_FETCH_TIMEOUT_MS = 8_000;

export function usePaymentBalance(): UsePaymentBalanceResult {
  const { host } = useCoinPaymentHost();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: hostKeys.paymentBalance(),
    queryFn: async (): Promise<PaymentHostBalance> => {
      // `enabled` keeps this from running while `host` is null.
      if (host === null) throw new Error("payment host not resolved");
      return runExclusiveHostModal(async () => {
        console.info("[w3spay/balance] fetching…");
        const { promise: timeout, reject: rejectTimeout } =
          Promise.withResolvers<never>();
        setTimeout(
          () =>
            rejectTimeout(
              new Error(
                "Balance request timed out. Check your connection and try again.",
              ),
            ),
          BALANCE_FETCH_TIMEOUT_MS,
        );
        const balance = await Promise.race([host.paymentBalance(), timeout]);
        console.info("[w3spay/balance] fetched", { available: balance.available });
        return balance;
      });
    },
    enabled: host !== null,
    staleTime: 15_000,
    // No automatic retries — the BootErrorScreen provides an explicit
    // "Try again" button so the user controls the retry cycle.
    retry: 0,
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: hostKeys.paymentBalance() });
  }, [queryClient]);

  const state: PaymentBalanceState =
    host === null
      ? { kind: "idle" }
      : query.isSuccess
        ? { kind: "ready", balance: query.data }
        : query.isError
          ? {
              kind: "error",
              reason:
                query.error instanceof Error
                  ? query.error.message
                  : String(query.error),
            }
          : { kind: "loading" };

  return { state, refresh };
}

export interface PaymentBalanceDerived {
  readonly state: PaymentBalanceState;
  /**
   * Spendable balance in cents. `null` while loading; otherwise a real
   * amount, OR `dummyBalanceCents` when the host couldn't read the real
   * one (see `balanceDummy`).
   */
  readonly availableCents: number | null;
  /** `true` when `availableCents` is the synthetic fallback. */
  readonly balanceDummy: boolean;
  /**
   * `true` once the host's balance permission modal has resolved (granted
   * OR errored) — the camera probe must wait for this.
   */
  readonly balancePermissionResolved: boolean;
  /** Invalidates the balance query — exposed so gate screens can offer an explicit retry. */
  readonly refresh: () => void;
}

/** Balance plus the three derived values the routing / banners read. */
export function usePaymentBalanceDerived(): PaymentBalanceDerived {
  const { state, refresh } = usePaymentBalance();
  const balanceDummy = state.kind === "error";
  const availableCents =
    state.kind === "ready"
      ? state.balance.available
      : balanceDummy
        ? envConfig.payment.dummyBalanceCents
        : null;
  const balancePermissionResolved =
    state.kind === "ready" || state.kind === "error";
  return { state, availableCents, balanceDummy, balancePermissionResolved, refresh };
}
