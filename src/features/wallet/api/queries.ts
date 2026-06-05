// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Read-side wallet hooks — TanStack Queries over the local KvStore backing the
 * Activity / Receipts lists and the id-addressed detail routes. The payment
 * mutations invalidate these keys, so fresh writes show up without manual refresh.
 */

import { useQuery } from "@tanstack/react-query";

import {
  readPaymentHistory,
  type PaymentRecord,
} from "@/features/wallet/api/payment-history.ts";
import { readReceipts, type ReceiptRecord } from "@/features/wallet/api/receipts.ts";
import { getTerminalStore } from "@/features/host/lib/terminal-store.ts";
import { walletKeys } from "@/features/wallet/api/keys.ts";

/** Newest-first local payment-history mirror (Activity tab). */
export function usePaymentHistory() {
  return useQuery<PaymentRecord[]>({
    queryKey: walletKeys.paymentHistory(),
    queryFn: () => readPaymentHistory(getTerminalStore()),
    staleTime: 10_000,
  });
}

/** Newest-first saved `t3rminal-receipt` list (Receipts tab). */
export function useReceipts() {
  return useQuery<ReceiptRecord[]>({
    queryKey: walletKeys.receipts(),
    queryFn: () => readReceipts(getTerminalStore()),
    staleTime: 10_000,
  });
}
