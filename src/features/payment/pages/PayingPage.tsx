// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** In-flight payment page — status surface; `performPayment` navigates to `/done` or `/pay-error`. */

import { PayingScreen } from "@/features/payment/components/PayingScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function PayingPage() {
  const flow = useFlowStage("paying");
  if (flow === null) return null;
  return (
    <PayingScreen
      amountCents={flow.parsed.amountCents + flow.tipCents}
      merchantDisplayName={flow.merchant.displayName}
    />
  );
}
