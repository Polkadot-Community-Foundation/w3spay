// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Dev-only manual-payment override button, gated behind
 * `features.devPaymentOverride`. Self-suppresses on /dev-* and /wallet*
 * routes so a tap never yanks an in-flight form or teleports behind the wallet.
 */

import { useLocation } from "@tanstack/react-router";

import { envConfig } from "@/config";
import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";

export function DevPayLauncher() {
  const { pathname } = useLocation();
  const { startDevPay } = usePaymentActions();

  if (!envConfig.features.devPaymentOverride) return null;
  if (pathname.startsWith("/wallet")) return null;
  if (pathname.startsWith("/dev-")) return null;

  return (
    <button
      type="button"
      className="dev-pay-launcher"
      onClick={startDevPay}
      aria-label="Open dev manual-payment form"
      title="Dev · manual pay"
    >
      <span className="dev-pay-launcher__dot" aria-hidden="true" />
      <span className="dev-pay-launcher__label">DEV</span>
    </button>
  );
}
