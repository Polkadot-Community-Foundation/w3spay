// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Dev-only failed manual payment — shows the real host reason, not the friendly customer copy. */

import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { DevPayErrorView } from "@/features/payment/components/DevPayScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function DevPayErrorPage() {
  const flow = useFlowStage("devPayError");
  const actions = usePaymentActions();
  if (flow === null) return null;
  return (
    <DevPayErrorView
      message={flow.message}
      amountCents={flow.amountCents}
      destinationHex={flow.destinationHex}
      onRetry={actions.startDevPay}
      onCancel={actions.startScan}
    />
  );
}
