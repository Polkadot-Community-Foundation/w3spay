// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Wallet route table. Detail routes are id-addressed so a reload / deep-link
 * rehydrates from the local KvStore. `validateSearch` is the single source of
 * truth for the wallet tab union.
 */

import { createRoute } from "@tanstack/react-router";

import { PATHS } from "@/app/router/routes.ts";
import { rootRoute } from "@/app/router/root.tsx";
import { PaymentDetailPage } from "@/features/wallet/pages/PaymentDetailPage.tsx";
import { ReceiptDetailPage } from "@/features/wallet/pages/ReceiptDetailPage.tsx";
import { WalletPage } from "@/features/wallet/pages/WalletPage.tsx";
import type { WalletTab } from "@/features/wallet/components/WalletScreen.tsx";

interface WalletSearch {
  readonly tab: WalletTab;
}

export const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PATHS.wallet,
  validateSearch: (search: Record<string, unknown>): WalletSearch => ({
    tab: search.tab === "receipts" ? "receipts" : "activity",
  }),
  component: WalletPage,
});

export const paymentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PATHS.paymentDetail,
  component: PaymentDetailPage,
});

export const receiptDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: PATHS.receiptDetail,
  component: ReceiptDetailPage,
});

export const walletRoutes = [walletRoute, paymentDetailRoute, receiptDetailRoute];
