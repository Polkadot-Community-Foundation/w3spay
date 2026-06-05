// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Tip entry page — add a tip on top of the receipt subtotal, then move to confirm. */

import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { TipScreen } from "@/features/payment/components/TipScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function TipPage() {
  const flow = useFlowStage("tip");
  const actions = usePaymentActions();
  if (flow === null) return null;
  const { parsed, merchant } = flow;
  return (
    <TipScreen
      merchantDisplayName={merchant.displayName}
      subtotalCents={parsed.amountCents}
      onSkip={() => actions.goToStage({ kind: "confirm", parsed, merchant, tipCents: 0 })}
      onContinue={(tipCents) =>
        actions.goToStage({ kind: "confirm", parsed, merchant, tipCents })
      }
    />
  );
}
