// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Write-side payment hooks as TanStack Query mutations, wrapping the
 * framework-free data functions and owning each write's cache invalidation so
 * the read queries refresh automatically:
 *
 *   - `useSendPayment`   — host round-trip; optimistically deducts the paid
 *                          amount from the cached balance. An immediate
 *                          invalidate would race the host's balance
 *                          subscription and overwrite it with the stale
 *                          pre-payment amount (see balance.ts staleTime).
 *   - `useAppendPayment` — local history mirror; invalidates Activity.
 *   - `useSaveReceipt`   — local saved-receipt store; invalidates Receipts.
 *
 * Orchestration (telemetry, navigation, idempotency ordering) lives in
 * `usePaymentActions`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PaymentHostBalance } from "@/features/host/lib/payment-host.ts";

import {
  sendPayment,
  type SendPaymentInput,
  type SendPaymentResult,
} from "@/features/payment/api/send-payment.ts";
import { appendPayment, type PaymentRecord } from "@/features/wallet/api/payment-history.ts";
import { saveReceipt, type ReceiptRecord } from "@/features/wallet/api/receipts.ts";
import { getTerminalStore } from "@/features/host/lib/terminal-store.ts";
import { hostKeys } from "@/features/host/api/keys.ts";
import { walletKeys } from "@/features/wallet/api/keys.ts";

/** Host-routed payment. Applies an optimistic balance deduction on success. */
export function useSendPayment() {
  const queryClient = useQueryClient();
  return useMutation<SendPaymentResult, Error, SendPaymentInput>({
    mutationFn: (input) => sendPayment(input),
    onSuccess: (_data, variables) => {
      // Immediately reflect the deducted amount so the balance chip shows the
      // correct value. An immediate invalidate + refetch would race the host's
      // internal balance-subscription propagation and overwrite this with the
      // stale pre-payment amount. The query's staleTime + refetchOnWindowFocus
      // will sync the true balance once the host has updated.
      queryClient.setQueryData<PaymentHostBalance>(
        hostKeys.paymentBalance(),
        (old) => (old ? { available: Math.max(0, old.available - variables.amountCents) } : old),
      );
    },
  });
}

/**
 * Append a row to the local payment-history mirror and refresh the
 * Activity list. The underlying `appendPayment` swallows its own write
 * errors, so this never rejects; call sites fire it and move on.
 */
export function useAppendPayment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, PaymentRecord>({
    mutationFn: (record) => appendPayment(getTerminalStore(), record),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.paymentHistory() });
    },
  });
}

/**
 * Save a scanned `t3rminal-receipt` locally and refresh the Receipts
 * list. `saveReceipt` is best-effort and never throws.
 */
export function useSaveReceipt() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, ReceiptRecord>({
    mutationFn: (record) => saveReceipt(getTerminalStore(), record),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.receipts() });
    },
  });
}
