// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Payment-error page — payment-side failure (auth/host failures route to the gate instead).
 * Retry returns to `/confirm` with the same parsed receipt + tip to preserve prior-attempt context.
 */

import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { PaymentFailedScreen } from "@/features/payment/components/PaymentFailedScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function PayErrorPage() {
  const flow = useFlowStage("payError");
  const actions = usePaymentActions();
  if (flow === null) return null;
  const { parsed, merchant, tipCents, message } = flow;
  return (
    <PaymentFailedScreen
      message={message}
      amountCents={parsed.amountCents + tipCents}
      onRetry={() => actions.goToStage({ kind: "confirm", parsed, merchant, tipCents })}
      onCancel={actions.startScan}
    />
  );
}
