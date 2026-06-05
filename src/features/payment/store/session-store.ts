// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Payment-session store (Zustand) — the in-flight customer flow's client
 * state that must survive route changes: `flow` (active stage payload,
 * written together with the route by `usePaymentActions` and reconciled by
 * each route's entry guard), `lastQrText`, `lastBadScan`, and `resolving`.
 *
 * A module-level store (not context): a single customer drives one flow, and
 * the route guards read `getState()` synchronously at navigation time.
 */

import { create } from "zustand";

import type { LastBadScan } from "@/features/payment/lib/stage.ts";
import type { FlowStage } from "@/features/payment/lib/route-from-stage.ts";

interface SessionState {
  readonly flow: FlowStage | null;
  readonly lastQrText: string | null;
  readonly lastBadScan: LastBadScan | null;
  readonly resolving: boolean;
  /** Set the active flow payload. Clears `resolving` (we've left the splash). */
  setFlow(flow: FlowStage | null): void;
  setLastQrText(text: string | null): void;
  setLastBadScan(scan: LastBadScan | null): void;
  setResolving(resolving: boolean): void;
  /** Reset everything the scan screen owns when starting a fresh scan. */
  resetScan(): void;
}

export const useSessionStore = create<SessionState>((set) => ({
  flow: null,
  lastQrText: null,
  lastBadScan: null,
  resolving: false,
  setFlow: (flow) => set({ flow, resolving: false }),
  setLastQrText: (lastQrText) => set({ lastQrText }),
  setLastBadScan: (lastBadScan) => set({ lastBadScan }),
  setResolving: (resolving) => set({ resolving }),
  resetScan: () => set({ flow: null, lastBadScan: null, resolving: false }),
}));
