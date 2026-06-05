// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Dev-only in-memory `PaymentHost` for standalone `vite dev` (no real host).
 * Tracks a planck balance and settles every request instantly; the seed is
 * large enough that any single QR-scan payment clears without a top-up.
 *
 * Denominated in plancks to match the planck wire on real hosts; state is
 * lost on refresh and tree-shaken from production by the `isDevStandalone()`
 * gate at the call site.
 */

import { envConfig } from "@/config";
import { safeNumberFromBigInt, type PaymentHost } from "@/features/host/lib/payment-host.ts";

let cached: PaymentHost | null = null;

/**
 * Lazy singleton — same instance across HMR re-renders so a successful
 * payment isn't reset when React re-runs the host `useMemo`.
 */
export function getDevPaymentHost(): PaymentHost {
  if (cached !== null) return cached;

  const plancksPerCent = BigInt(envConfig.token.plancksPerCent);
  let balancePlancks = BigInt(envConfig.payment.devStartingBalancePlancks);
  let receiptCounter = 0;

  cached = {
    async paymentBalance() {
      return {
        available: safeNumberFromBigInt(balancePlancks / plancksPerCent, "dev balance"),
      };
    },
    async paymentRequest(amountCents) {
      const amountPlancks = BigInt(amountCents) * plancksPerCent;
      if (amountPlancks > balancePlancks) {
        throw new Error(
          `dev reference host: balance ${balancePlancks} plancks below requested ${amountPlancks}`,
        );
      }
      balancePlancks -= amountPlancks;
      receiptCounter += 1;
      return { id: `dev-${receiptCounter}`, settlement: "settled" };
    },
  };
  console.info(
    `[w3spay/dev] standalone reference PaymentHost installed (seed=${envConfig.payment.devStartingBalancePlancks} plancks)`,
  );
  return cached;
}
