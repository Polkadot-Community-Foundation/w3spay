// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Module-level singleton state for the debug panel. Three streams:
 *   1. Console logs — ring buffer populated by `console-capture.ts`.
 *   2. Boot events — explicit `recordBootEvent()` markers from wallet init,
 *      rendered as a timeline tab.
 *   3. Host snapshot — set by the panel via `setHostSnapshot()`. The store is
 *      React-agnostic (doesn't import `wallet.ts`) to avoid a cycle.
 *
 * Exposes a `subscribe()` + `useSyncExternalStore`-friendly `getSnapshot()`.
 */

export type DebugLogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface DebugLogRecord {
  readonly id: number;
  readonly timestamp: number;
  readonly level: DebugLogLevel;
  readonly message: string;
  readonly source: "console" | "window" | "boot-event" | "manual";
}

export type WalletPhase =
  | "handshake"
  | "connect-host"
  | "inject-extension"
  | "get-product-account"
  | "build-signer"
  | "claim-allowances"
  | "ready"
  | "error";

export interface DebugBootEvent {
  readonly id: number;
  readonly timestamp: number;
  readonly phase: WalletPhase;
  readonly outcome: "start" | "ok" | "error";
  readonly message?: string;
}

export interface DebugHostSnapshot {
  readonly stateKind:
    | "outside-host"
    | "pending"
    | "resolving"
    | "ready"
    | "requesting-access"
    | "error";
  readonly phase?: WalletPhase;
  readonly address?: string;
  readonly errorReason?: string;
  readonly isReady: boolean;
  readonly isInitializing: boolean;
  readonly isOutsideHost: boolean;
  readonly allowanceCount: number;
  readonly environment: "desktop-webview" | "web-iframe" | "standalone";
  /** Snapshot timestamp — for "stale X seconds" rendering. */
  readonly updatedAt: number;
}

export interface DebugStoreState {
  readonly logs: readonly DebugLogRecord[];
  readonly bootEvents: readonly DebugBootEvent[];
  readonly hostSnapshot: DebugHostSnapshot | null;
  readonly installed: boolean;
}

const INITIAL: DebugStoreState = {
  logs: [],
  bootEvents: [],
  hostSnapshot: null,
  installed: false,
};

let logs: DebugLogRecord[] = [];
let bootEvents: DebugBootEvent[] = [];
let hostSnapshot: DebugHostSnapshot | null = null;
let installed = false;
let nextEventId = 0;
const subscribers = new Set<() => void>();

/**
 * Cached snapshot object. **Critical for `useSyncExternalStore`:** a fresh
 * object literal on each `getSnapshot()` call would infinite-loop the panel,
 * since the hook treats a new identity as "store changed". Invalidated only
 * inside `notify()` — the single place the store mutates.
 */
let cachedSnapshot: DebugStoreState = {
  logs,
  bootEvents,
  hostSnapshot,
  installed,
};

function notify(): void {
  // Refresh the cached object before notifying so subscribers observe a
  // snapshot consistent with the change they were notified about.
  cachedSnapshot = {
    logs: logs.slice(),
    bootEvents: bootEvents.slice(),
    hostSnapshot,
    installed,
  };
  for (const cb of subscribers) cb();
}

/** Append a console-log record. Trims `capacity` oldest if over. */
export function appendLog(entry: DebugLogRecord, capacity: number): void {
  logs.push(entry);
  if (logs.length > capacity) {
    logs = logs.slice(logs.length - capacity);
  }
  notify();
}

/** Append a boot-event marker. The wallet store calls this at each
 *  phase transition. */
export function recordBootEvent(
  phase: WalletPhase,
  outcome: DebugBootEvent["outcome"],
  message?: string,
): void {
  bootEvents.push({
    id: nextEventId,
    timestamp: Date.now(),
    phase,
    outcome,
    message,
  });
  nextEventId += 1;
  notify();
}

/** Update the host-state snapshot. The panel calls this from a React
 *  effect that consumes `useHostWalletSnapshot()`. */
export function setHostSnapshot(snapshot: DebugHostSnapshot | null): void {
  hostSnapshot = snapshot;
  notify();
}

/** Mark the capture as installed. The panel's auto-installer calls
 *  this on mount so the badge can render "Capture: ON". */
export function setInstalled(value: boolean): void {
  installed = value;
  notify();
}

/** Clear the console-log buffer. */
export function clearLogs(): void {
  logs = [];
  notify();
}

/** Clear the boot-event buffer. */
export function clearBootEvents(): void {
  bootEvents = [];
  notify();
}

/** Subscribe to store changes. Returns the unsubscribe. */
export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** Get a one-shot snapshot of the current state. */
export function getSnapshot(): DebugStoreState {
  return cachedSnapshot;
}

export const debugStore = {
  appendLog,
  recordBootEvent,
  setHostSnapshot,
  setInstalled,
  clearLogs,
  clearBootEvents,
  subscribe,
  getSnapshot,
};

export const __INITIAL_DEBUG_STATE = INITIAL;
