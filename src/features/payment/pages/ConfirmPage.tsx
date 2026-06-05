// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Confirm page — shows receipt totals + merchant, then sends the payment or surfaces the top-up hint. */

import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { ConfirmScreen } from "@/features/payment/components/ConfirmScreen.tsx";
import { useCoinPaymentHost } from "@/features/host/api/coin-payment-host.ts";
import { usePaymentBalanceDerived } from "@/features/host/api/balance.ts";
import { envConfig } from "@/config";
import { useFlowStage } from "@/app/router/guards.ts";

export function ConfirmPage() {
  const flow = useFlowStage("confirm");
  const actions = usePaymentActions();
  const { host } = useCoinPaymentHost();
  const { availableCents } = usePaymentBalanceDerived();
  if (flow === null) return null;
  const { parsed, merchant, tipCents } = flow;
  const totalCents = parsed.amountCents + tipCents;
  const insufficient =
    availableCents !== null &&
    availableCents < Math.max(totalCents, envConfig.payment.minSpendableCents);
  return (
    <ConfirmScreen
      merchantDisplayName={merchant.displayName}
      merchantId={merchant.merchantId}
      terminalId={merchant.terminalId}
      parsed={parsed}
      tipCents={tipCents}
      destinationDisplay={merchant.destination.value}
      availableBalanceCents={availableCents}
      insufficient={insufficient}
      onConfirm={() => {
        if (host) void actions.performPayment(parsed, merchant, tipCents, host);
      }}
      onCancel={actions.startScan}
    />
  );
}
