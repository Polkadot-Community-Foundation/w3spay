// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Console output capture — monkey-patches `console.log/info/warn/error` and
 * the `window.onerror` / `unhandledrejection` hooks for the debug panel.
 *
 * Module-level so an invisible panel still captures the full boot path; the
 * capture starts at import. It's additive — original `console.*` methods are
 * preserved and still called (replacing them would break Sentry's `beforeSend`
 * console instrumentation). The ring buffer is capped because the host-API SDK
 * can emit dozens of lines/sec during iOS webview-port bring-up.
 */

import {
  debugStore,
  setInstalled,
  type DebugLogLevel,
  type DebugLogRecord,
} from "./debug-store.ts";

const ORIGINAL_METHODS = new Map<DebugLogLevel, (...args: unknown[]) => void>();
type WindowOnError = Window["onerror"];
type WindowOnUnhandledRejection = Window["onunhandledrejection"];
let originalOnError: WindowOnError = null;
let originalOnUnhandledRejection: WindowOnUnhandledRejection = null;
let installed = false;

/**
 * Max records the ring buffer keeps; oldest dropped past this. Sized to give
 * ~30s of activity at the noisy boot cadence.
 */
const RING_BUFFER_CAPACITY = 2000;

const FORMATTABLE_LEVELS: ReadonlyArray<DebugLogLevel> = ["log", "info", "warn", "error", "debug"];

/**
 * Stringify `console.*` args, faithful to native rendering — strings/numbers
 * verbatim, objects single-level JSON.stringify, Errors as name+message+stack.
 */
function formatArgs(args: unknown[]): string {
  const out: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      out.push(arg);
    } else if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
      out.push(String(arg));
    } else if (arg === null) {
      out.push("null");
    } else if (arg === undefined) {
      out.push("undefined");
    } else if (arg instanceof Error) {
      const stack = arg.stack ? `\n${arg.stack}` : "";
      out.push(`${arg.name}: ${arg.message}${stack}`);
    } else {
      try {
        out.push(JSON.stringify(arg, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
      } catch {
        out.push(String(arg));
      }
    }
  }
  return out.join(" ");
}

/**
 * Push a record into the ring buffer. The store trims to capacity and notifies
 * subscribers on the next microtask so a burst doesn't fire one React
 * re-render per call.
 */
function record(level: DebugLogLevel, message: string, source: DebugLogRecord["source"]): void {
  const entry: DebugLogRecord = {
    id: nextId(),
    timestamp: Date.now(),
    level,
    source,
    message,
  };
  debugStore.appendLog(entry, RING_BUFFER_CAPACITY);
}

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}

/**
 * Install the global capture. Idempotent and stays installed for the page
 * lifetime. Production callers should NOT install unless the debug panel is
 * expected to surface, since the ring buffer costs memory.
 */
export function installConsoleCapture(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  // Console method signatures differ per level; index via a loose record to
  // install one uniform capture. The original is invoked verbatim via `.call`.
  const consoleRecord = console as unknown as Record<
    DebugLogLevel,
    (...args: unknown[]) => void
  >;

  for (const level of FORMATTABLE_LEVELS) {
    // Capture the original unbound — DON'T `.bind(console)`, or a re-install
    // would re-bind a re-bound function, piling up `bound bound` wrappers.
    const original = (consoleRecord[level] ?? (() => undefined)) as (
      ...args: unknown[]
    ) => void;
    ORIGINAL_METHODS.set(level, original);
    consoleRecord[level] = (...args: unknown[]) => {
      record(level, formatArgs(args), "console");
      // Preserve native rendering so Sentry's beforeBreadcrumb integration
      // and the dev's normal debugging both keep working.
      original.apply(console, args);
    };
  }

  // Mark the store as installed so the panel's "CAPTURE" badge flips.
  setInstalled(true);

  // Capture window.onerror — last-ditch uncaught throw handler.
  originalOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    const text = typeof message === "string" ? message : String(message);
    record(
      "error",
      `window.onerror: ${text} (${source}:${lineno}:${colno})${error ? "\n" + (error.stack ?? error.message ?? "") : ""}`,
      "window",
    );
    if (originalOnError) {
      return originalOnError.call(this, message, source, lineno, colno, error);
    }
    return false;
  };

  // Capture unhandledrejection — async throws that escape the promise chain.
  originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    const reason = event?.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    record("error", `unhandledrejection: ${message}${reason instanceof Error && reason.stack ? "\n" + reason.stack : ""}`, "window");
    if (typeof originalOnUnhandledRejection === "function") {
      return originalOnUnhandledRejection.call(window, event);
    }
    return undefined;
  };
}

/**
 * Tear down the capture. Test-only — production MUST NOT call this; the panel
 * expects the full boot path even when the button is closed, so the capture
 * stays installed for the page lifetime.
 */
export function __uninstallConsoleCaptureForTests(): void {
  if (!installed) return;
  installed = false;
  const consoleRecord = console as unknown as Record<
    DebugLogLevel,
    (...args: unknown[]) => void
  >;
  for (const level of FORMATTABLE_LEVELS) {
    const original = ORIGINAL_METHODS.get(level);
    if (original) consoleRecord[level] = original;
  }
  ORIGINAL_METHODS.clear();
  if (window.onerror && originalOnError) {
    window.onerror = originalOnError;
  }
  if (originalOnUnhandledRejection !== null) {
    window.onunhandledrejection = originalOnUnhandledRejection;
  }
  originalOnError = null;
  originalOnUnhandledRejection = null;
}
