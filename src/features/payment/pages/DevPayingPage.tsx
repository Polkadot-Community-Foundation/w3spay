// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Dev-only in-flight manual payment — status surface; `performDevPayment` navigates to `/dev-done` or `/dev-pay-error`. */

import { DevPayingView } from "@/features/payment/components/DevPayScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function DevPayingPage() {
  const flow = useFlowStage("devPaying");
  if (flow === null) return null;
  return <DevPayingView amountCents={flow.amountCents} destinationHex={flow.destinationHex} />;
}
