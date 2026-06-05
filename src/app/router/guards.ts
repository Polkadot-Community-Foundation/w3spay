// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Shared guards for the flow routes. Every data-carrying flow route depends on
 * a matching `flow` payload in the session store; `requireFlow` redirects a
 * reload / deep-link with no (or mismatched) payload back to the scan index —
 * what makes the routed flow reload-safe. `useFlowStage` reads the active
 * payload narrowed to the expected kind.
 */

import { redirect } from "@tanstack/react-router";

import { useSessionStore } from "@/features/payment/store/session-store.ts";
import type { FlowStage } from "@/features/payment/lib/route-from-stage.ts";

/**
 * `beforeLoad` guard: redirect to the index unless the active flow stage is
 * `kind`. Reads the store synchronously — `usePaymentActions` always writes
 * `flow` before navigating, so the guard sees the payload on a real transition
 * and an empty store on a cold reload.
 */
export function requireFlow(kind: FlowStage["kind"]) {
  return () => {
    if (useSessionStore.getState().flow?.kind !== kind) {
      throw redirect({ to: "/" });
    }
  };
}

/**
 * Active flow stage narrowed to `kind`, or `null` when it isn't that stage
 * (belt-and-suspenders against the `beforeLoad` race).
 */
export function useFlowStage<K extends FlowStage["kind"]>(
  kind: K,
): Extract<FlowStage, { kind: K }> | null {
  const flow = useSessionStore((s) => s.flow);
  return flow !== null && flow.kind === kind
    ? (flow as Extract<FlowStage, { kind: K }>)
    : null;
}
