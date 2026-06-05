// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Scan-error page — QR detected but failed to parse (TSE format mismatch, malformed receipt JSON). */

import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { ScanFailedScreen } from "@/features/scan/components/ScanFailedScreen.tsx";
import { useFlowStage } from "@/app/router/guards.ts";

export function ScanErrorPage() {
  const flow = useFlowStage("scanError");
  const actions = usePaymentActions();
  if (flow === null) return null;
  return <ScanFailedScreen onRetry={actions.startScan} errorMessage={flow.message} />;
}
