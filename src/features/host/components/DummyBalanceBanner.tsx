// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Warn-tone banner shown when the host couldn't read the real spendable
 * balance and the flow is running on a synthetic one. Reads `balanceDummy`
 * and self-hides when the real balance returns.
 *
 * Intentionally not dismissable: the condition persists until the host
 * recovers, and silencing it mid-flow would set up a confusing payment
 * failure at the Pay tap.
 */

import { usePaymentBalanceDerived } from "@/features/host/api/balance.ts";

export function DummyBalanceBanner() {
  const { balanceDummy } = usePaymentBalanceDerived();
  if (!balanceDummy) return null;
  return (
    <div className="dummy-balance-banner" role="status" aria-live="polite">
      <span className="dummy-balance-banner__dot" aria-hidden="true" />
      <span className="dummy-balance-banner__text">
        <strong className="dummy-balance-banner__label">Demo balance.</strong>{" "}
        We couldn't read your real one — sign in &amp; top up in the Polkadot app to pay for real.
      </span>
    </div>
  );
}
