// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Host detection + AccountsProvider singleton. Shared across products that
 * run inside a Polkadot host (Desktop webview, mobile/dotli iframe) or
 * standalone; each app re-exports these from its local `host-connection.ts`.
 *
 * Auth is NOT driven from product code — dotli's topbar owns the QR-login
 * modal (RFC 0009) and Polkadot Desktop drives its own login UI.
 *
 * Async handshake: `isSandboxReady()` is not enough on iOS mobile hosts —
 * the SDK's `MessagePort` is published by the webview shell AFTER the iframe
 * mounts, and any host request before the port is up races the SDK's lazy
 * `isReady()` and surfaces as `RequestCredentialsErr::Unknown` ("Polkadot
 * host is not ready"). `connectToHost()` exposes that wait as an awaited,
 * cached, timed helper; the iOS gate (`injectHostWallet()`) runs first so a
 * host that only responds after Spektr is bridged isn't raced out by the
 * 15s budget.
 */

import {
  createAccountsProvider,
  injectSpektrExtension as sdkInjectSpektrExtension,
  hostApi,
  requestDevicePermission,
  requestPermission,
  sandboxProvider,
  sandboxTransport,
} from "@novasamatech/host-api-wrapper";
import { enumValue } from "@novasamatech/host-api";

declare global {
  interface Window {
    /** Set by Polkadot Desktop's webview shell. */
    __HOST_WEBVIEW_MARK__?: boolean;
  }
}

export type HostEnvironment = "desktop-webview" | "web-iframe" | "standalone";

/**
 * Synchronous DOM-based host detection. Used for the initial render —
 * `isInsideContainer()` from `@parity/product-sdk-host` is async and would
 * block the first paint.
 */
export function detectHostEnvironment(): HostEnvironment {
  if (typeof window === "undefined") return "standalone";
  if (window.__HOST_WEBVIEW_MARK__ === true) return "desktop-webview";
  try {
    if (window !== window.top) return "web-iframe";
  } catch {
    // Cross-origin iframe — `window.top` access throws, treat as hosted.
    return "web-iframe";
  }
  return "standalone";
}

export function isInHost(): boolean {
  return detectHostEnvironment() !== "standalone";
}

/**
 * Whether the in-page sandbox MessagePort published by the host is present.
 * The AccountsProvider still constructs without one, but every request times
 * out — `connectToHost` uses this as a fast-fail short-circuit.
 */
export function isSandboxReady(): boolean {
  return sandboxProvider.isCorrectEnvironment();
}

type AccountsProvider = ReturnType<typeof createAccountsProvider>;

/**
 * Lazy singleton AccountsProvider. One shared instance means every
 * `subscribeAccountConnectionStatus` listener sees the same status stream.
 */
let accountsProvider: AccountsProvider | null = null;

export function getAccountsProvider(): AccountsProvider {
  if (accountsProvider === null) {
    accountsProvider = createAccountsProvider(sandboxTransport);
  }
  return accountsProvider;
}

/**
 * True during `vite dev` only for standalone local runs with no host bridge.
 * `import.meta.env.DEV` is `false` in prod builds, so callers gated by this
 * branch are tree-shaken out of prod bundles regardless of the runtime check.
 */
export function isDevStandalone(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  return !isInHost() && (window as Window & { truapi?: unknown }).truapi == null;
}

/**
 * iOS platform detection. Covers iPhone / iPod / classic iPad UAs and iPadOS
 * 13+ which sends a Mac UA but is distinguishable via touch points.
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPod|iPad/.test(ua)) return true
  if (/Mac/.test(ua) && navigator.maxTouchPoints > 1) return true
  return false
}

/**
 * True when running inside the Polkadot iOS host. Used to apply iOS-host-only
 * workarounds (e.g. the host injects a viewport meta without `viewport-fit=cover`,
 * which collapses `env(safe-area-inset-*)` to 0).
 */
export function isHostIOS(): boolean {
  return isInHost() && isIOS()
}

/**
 * Wall-clock budget for the host-API transport handshake. On Polkadot mobile
 * the webview port can take several seconds to publish on a cold start —
 * anything shorter risks false negatives on first launch.
 */
export const HOST_HANDSHAKE_TIMEOUT_MS = 15_000;

/**
 * Race a promise against a wall-clock timeout. The timer is always cleared on
 * settle so it can't fire after a late winner already settled the race.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Async handshake cache. `connected` sticks once `true` so repeat calls
 * short-circuit; a `false` outcome is NOT cached, so a "retry" CTA gets a
 * fresh shot without a page reload.
 */
let connected = false;
let inFlightHandshake: Promise<boolean> | null = null;

/**
 * Await the host-API transport handshake and prime the AccountsProvider
 * singleton. MUST be awaited before any direct host request — without it
 * they race the handshake and on slow webview-port bring-up (Polkadot
 * mobile) surface `RequestCredentialsErr::Unknown` ("Polkadot host is not
 * ready").
 *
 * Returns `true` once the handshake succeeds (cached for the page lifetime);
 * `false` outside a host, on failure, or on timeout — NOT cached, so a
 * subsequent call re-attempts. Concurrent calls share one in-flight promise,
 * bounded by `HOST_HANDSHAKE_TIMEOUT_MS`.
 */
export async function connectToHost(
  timeoutMs: number = HOST_HANDSHAKE_TIMEOUT_MS,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!isInHost()) return false;
  if (connected) return true;
  if (inFlightHandshake) return inFlightHandshake;

  if (!isSandboxReady()) {
    // Don't short-circuit — on Polkadot mobile the port can take a beat to
    // publish. Fall through to the awaited handshake below (it has its own
    // timeout); without this the first iOS effect races the port and we're
    // back to the RequestCredentialsErr::Unknown bug.
    console.log("[host] sandbox transport not yet in scope; awaiting handshake");
  }

  // Priming the AccountsProvider singleton; constructing the wrapper does
  // not open the connection — `sandboxTransport.isReady()` completes the
  // handshake.
  // eslint-disable-next-line no-console
  console.info(
    "[host] connectToHost: priming AccountsProvider, awaiting sandboxTransport.isReady()",
  );
  getAccountsProvider();

  inFlightHandshake = withTimeout(
    sandboxTransport.isReady().then((ready) => {
      connected = ready;
      if (ready) {
        // eslint-disable-next-line no-console
        console.info("[host] handshake ok");
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[host] handshake did not complete within the SDK budget; transport returned false",
        );
      }
      return ready;
    }),
    timeoutMs,
    "[host] handshake",
  )
    .catch((caught) => {
      const message = caught instanceof Error ? caught.message : String(caught);
      console.warn(`[host] handshake failed: ${message}`);
      connected = false;
      return false;
    })
    .finally(() => {
      inFlightHandshake = null;
    });

  return inFlightHandshake;
}

/** Read the cached handshake outcome (post-`connectToHost` resolution). */
export function isHostConnected(): boolean {
  return connected;
}


/**
 * The host renders exactly ONE permission/consent modal at a time and
 * silently DROPS any modal request that arrives while another is open.
 * Several subsystems pop modals at boot (Sentry remote-origin grant,
 * balance-access consent, camera grant), so without coordination the later
 * requests race and vanish.
 *
 * `runExclusiveHostModal` funnels every modal-popping host call through a
 * single FIFO queue: request N+1 fires only once modal N has settled
 * (granted, denied, or timed out) — a denial never wedges the queue.
 *
 * Only wrap discrete request/response calls whose promise settles when the
 * modal closes. NEVER wrap a long-lived subscription — the lock would be held
 * for its whole lifetime and starve every later modal.
 */
const HOST_MODAL_MAX_LOCK_MS = 120_000;

let hostModalQueue: Promise<unknown> = Promise.resolve();

export function runExclusiveHostModal<T>(task: () => PromiseLike<T>): Promise<T> {
  // Run the task whether the previous entry resolved or rejected.
  const run = Promise.resolve(hostModalQueue).then(task, task);
  // Advance the tail when this task settles, or after a hard ceiling so a
  // host that never answers a modal can't starve later modals. The caller
  // still awaits the real (possibly rejecting) `run`.
  const { promise: ceiling, resolve: openCeiling } = Promise.withResolvers<void>();
  const timer = setTimeout(openCeiling, HOST_MODAL_MAX_LOCK_MS);
  hostModalQueue = Promise.race([
    run.then(
      () => undefined,
      () => undefined,
    ),
    ceiling,
  ]).finally(() => {
    clearTimeout(timer);
  });
  return run;
}

/**
 * Ask the host to grant the camera permission.
 *
 * Outside a host: returns `true` unconditionally — the browser's native
 * `getUserMedia` prompt is the right surface, and `false` here would deadlock
 * the scanner into its denied state.
 *
 * Inside a host: delegates to `requestDevicePermission("Camera")`. The dot.li
 * iframe only sets `allow="camera"` after the host modal grants, so without
 * this gate the first `getUserMedia` is rejected regardless of the user's
 * actual preference. Transport/encoding errors are thrown so the caller can
 * decide whether to fall through to getUserMedia.
 *
 * A successful grant is cached for the page lifetime (the host SDK doesn't
 * guarantee idempotency across platforms — one journey could otherwise fire
 * 3 modals). Denials and errors are NOT cached — `retry()` calls
 * `resetCameraPermissionCache()`.
 */
let cameraGrantCache: true | null = null;
let inFlightCameraGrant: Promise<boolean> | null = null;

export async function requestCameraPermission(): Promise<boolean> {
  if (!isInHost()) return true;
  if (cameraGrantCache === true) return true;
  if (inFlightCameraGrant !== null) return inFlightCameraGrant;
  const pending = runExclusiveHostModal(() => requestDevicePermission("Camera"))
    .then((result) =>
      result.match(
        (granted) => {
          if (granted) cameraGrantCache = true;
          return granted;
        },
        (err) => {
          const reason =
            "reason" in err && typeof err.reason === "string" ? err.reason : "unknown";
          throw new Error(`[host] requestCameraPermission failed: ${reason}`);
        },
      ),
    )
    .finally(() => {
      inFlightCameraGrant = null;
    });
  inFlightCameraGrant = pending;
  return pending;
}

/**
 * Drop the cached camera grant so the next `requestCameraPermission()`
 * re-issues the host modal. Called from `useCameraPermission().retry()` after
 * the user fixes their grant in host settings. NEVER call from random code
 * paths — the cache exists so the happy path doesn't re-modal.
 */
export function resetCameraPermissionCache(): void {
  cameraGrantCache = null;
  inFlightCameraGrant = null;
}



/**
 * Outcome of a `requestRemoteOriginPermission` round-trip.
 *   - `granted: true`  — allowlisted (or already), OR outside a host.
 *   - `granted: false, error: undefined` — user denied at the host prompt.
 *   - `granted: false, error: string`    — transport / handshake failure.
 */
export interface RemoteOriginPermissionOutcome {
  readonly granted: boolean;
  readonly error?: string;
}

/**
 * Per-page-lifetime cache keyed by the sorted origin list — avoids re-issuing
 * the transport call when several subsystems ask for the same origins in one
 * session. Only definitive grants are cached; a transient failure stays
 * retryable.
 */
const remoteOriginOutcomes = new Map<string, RemoteOriginPermissionOutcome>();
const inFlightRemoteOrigins = new Map<string, Promise<RemoteOriginPermissionOutcome>>();

/**
 * Ask the host to allowlist outbound HTTP/WS to one or more origins so
 * `fetch`/`WebSocket` from the sandboxed iframe can reach them.
 *
 * Outside a host: resolves `{ granted: true }` without poking the SDK. Never
 * throws — denied/failed grants come back as `{ granted: false, error }`.
 * `origins` are bare host patterns per the host-API `Remote` codec
 * (e.g. `"*.example.com"`) — no scheme, no path.
 */
export function requestRemoteOriginPermission(
  origins: readonly string[],
): Promise<RemoteOriginPermissionOutcome> {
  if (!isInHost() || origins.length === 0) {
    return Promise.resolve({ granted: true });
  }
  const key = [...origins].sort().join(",");
  const cached = remoteOriginOutcomes.get(key);
  if (cached) return Promise.resolve(cached);
  const inFlight = inFlightRemoteOrigins.get(key);
  if (inFlight) return inFlight;
  const pending = doRequestRemoteOrigins([...origins])
    .then((outcome) => {
      if (outcome.granted) remoteOriginOutcomes.set(key, outcome);
      return outcome;
    })
    .finally(() => {
      inFlightRemoteOrigins.delete(key);
    });
  inFlightRemoteOrigins.set(key, pending);
  return pending;
}

async function doRequestRemoteOrigins(
  origins: string[],
): Promise<RemoteOriginPermissionOutcome> {
  try {
    const ready = await connectToHost();
    if (!ready) return { granted: false, error: "host transport not ready" };
    return await runExclusiveHostModal(() =>
      requestPermission({ tag: "Remote", value: origins }).match<RemoteOriginPermissionOutcome>(
        (granted) => ({ granted }),
        (err) => ({ granted: false, error: err.payload?.reason ?? err.message }),
      ),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return { granted: false, error: message };
  }
}
/**
 * Test-only reset for `connectToHost()`'s cache. Production code MUST NOT
 * call this — the connection's stability across a session is part of the boot
 * order other effects depend on.
 */
export function __resetHostConnectionForTests(): void {
  connected = false;
  inFlightHandshake = null;
  accountsProvider = null;
  injectedExtension = null;
  inFlightInject = null;
  allocationOutcomes.clear();
  inFlightAllocations.clear();
  remoteOriginOutcomes.clear();
  inFlightRemoteOrigins.clear();
  cameraGrantCache = null;
  inFlightCameraGrant = null;
}


/**
 * Resource allowances the host supports. New variants must be added here AND
 * to `isResourceAllowanceKind`'s narrowing.
 */
export type ResourceAllowanceKind =
  | "BulletInAllowance"
  | "SmartContractAllowance:0"
  | "AutoSigning"
  | "PreimageSubmit";

export function isResourceAllowanceKind(value: string): value is ResourceAllowanceKind {
  return (
    value === "BulletInAllowance" ||
    value === "SmartContractAllowance:0" ||
    value === "AutoSigning" ||
    value === "PreimageSubmit"
  );
}

export interface ResourceAllowanceOutcome {
  kind: ResourceAllowanceKind;
  /** `true` if the host granted (or had previously granted) the resource. */
  granted: boolean;
  /** Populated when the host surfaced a transport/encoding error. */
  error?: string;
}

/**
 * Wait for the host's wallet to be bridged as a browser extension into the
 * page's `injectedWeb3`. iOS-specific step that must run BEFORE any direct
 * host-API request: the SDK polls the webview port for bring-up; without it,
 * `sandboxTransport.isReady()` races the port on Polkadot mobile and resolves
 * `false` even though the host is up. Cached for the page lifetime; a `false`
 * outcome is NOT cached so a `retry` CTA can recover.
 */
let injectedExtension: boolean | null = null;
let inFlightInject: Promise<boolean> | null = null;

export function injectHostWallet(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!isInHost()) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: no host detected; skipping");
    return Promise.resolve(false);
  }
  if (injectedExtension === true) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: cached=true (already injected)");
    return Promise.resolve(true);
  }
  if (inFlightInject !== null) {
    // eslint-disable-next-line no-console
    console.info("[host] injectHostWallet: in-flight; sharing existing promise");
    return inFlightInject;
  }
  // eslint-disable-next-line no-console
  console.info(
    "[host] injectHostWallet: starting injectSpektrExtension (iOS webview-port bring-up)",
  );
  const startedAt = Date.now();
  inFlightInject = sdkInjectSpektrExtension()
    .then((ok) => {
      const elapsed = Date.now() - startedAt;
      if (ok) {
        injectedExtension = true;
        // eslint-disable-next-line no-console
        console.info(`[host] injectSpektrExtension ok (${elapsed}ms)`);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          `[host] injectSpektrExtension returned false (${elapsed}ms); host wallet unavailable`,
        );
      }
      return ok;
    })
    .catch((caught) => {
      const elapsed = Date.now() - startedAt;
      const reason = caught instanceof Error ? caught.message : String(caught);
      console.warn(
        `[host] injectSpektrExtension threw after ${elapsed}ms: ${reason}`,
      );
      return false;
    })
    .finally(() => {
      inFlightInject = null;
    });
  return inFlightInject;
}

/** Read the cached injection outcome (post-`injectHostWallet` resolution). */
export function isHostWalletInjected(): boolean {
  return injectedExtension === true;
}


/**
 * Per-page-lifetime cache of `requestResourceAllocation` outcomes, keyed by
 * resource kind so repeated claims are instant and don't re-prompt.
 */
const allocationOutcomes = new Map<ResourceAllowanceKind, ResourceAllowanceOutcome>();
const inFlightAllocations = new Map<ResourceAllowanceKind, Promise<ResourceAllowanceOutcome>>();

/** Wall-clock budget for a single claim. The allocation modal is user-interactive. */
export const ALLOC_TIMEOUT_MS = 120_000;

function buildAllocationRequest(kind: ResourceAllowanceKind): unknown {
  switch (kind) {
    case "BulletInAllowance":
      return enumValue("BulletInAllowance", undefined);
    case "SmartContractAllowance:0":
      return enumValue("SmartContractAllowance", 0);
    case "AutoSigning":
      return enumValue("AutoSigning", undefined);
    case "PreimageSubmit":
      return enumValue("PreimageSubmit", undefined);
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown resource allowance: ${String(_exhaustive)}`);
    }
  }
}

function claimOneAllowance(
  kind: ResourceAllowanceKind,
  timeoutMs: number,
): Promise<ResourceAllowanceOutcome> {
  const cached = allocationOutcomes.get(kind);
  if (cached !== undefined) {
    // eslint-disable-next-line no-console
    console.info(`[host] claimAllowance(${kind}): cached ${cached.granted ? "granted" : `denied (${cached.error})`}`);
    return Promise.resolve(cached);
  }
  const inFlight = inFlightAllocations.get(kind);
  if (inFlight !== undefined) {
    // eslint-disable-next-line no-console
    console.info(`[host] claimAllowance(${kind}): in-flight; sharing existing promise`);
    return inFlight;
  }
  // eslint-disable-next-line no-console
  console.info(
    `[host] claimAllowance(${kind}): starting hostApi.requestResourceAllocation (${timeoutMs}ms budget)`,
  );
  const startedAt = Date.now();
  const promise = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ResourceAllowanceOutcome>((resolve) => {
      timer = setTimeout(
        () => resolve({ kind, granted: false, error: `claimAllowance(${kind}) timed out after ${timeoutMs}ms` }),
        timeoutMs,
      );
    });
    const call = runExclusiveHostModal(async () => {
      try {
        const result = await Promise.resolve(
          hostApi.requestResourceAllocation(
            enumValue("v1", [buildAllocationRequest(kind)]) as unknown as Parameters<
              typeof hostApi.requestResourceAllocation
            >[0],
          ),
        );
        return await new Promise<ResourceAllowanceOutcome>((resolve) => {
          result.match(
            (response) => {
              const v = (response as unknown as { tag: string; value: unknown }).value;
              if (v && typeof v === "object" && "tag" in (v as Record<string, unknown>)) {
                const tag = String((v as { tag: unknown }).tag);
                if (tag === "Ok" || tag === "AlreadyGranted") {
                  resolve({ kind, granted: true });
                } else {
                  resolve({ kind, granted: false, error: tag });
                }
              } else {
                // Unknown shape — treat as granted.
                resolve({ kind, granted: true });
              }
            },
            (err) => {
              const reason =
                (err as { payload?: { reason?: string } })?.payload?.reason ?? "unknown";
              resolve({ kind, granted: false, error: reason });
            },
          );
        });
      } catch (caught) {
        const reason = caught instanceof Error ? caught.message : String(caught);
        return { kind, granted: false, error: reason };
      }
    });
    const outcome = await Promise.race([call, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    allocationOutcomes.set(kind, outcome);
    return outcome;
  })();
  inFlightAllocations.set(kind, promise);
  // Resolve the in-flight sentinel before the user's await unblocks
  // so a subsequent claim for the same kind observes the cache.
  void promise.then((outcome) => {
    const elapsed = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.info(
      `[host] claimAllowance(${kind}): ${outcome.granted ? "granted" : `denied (${outcome.error ?? "unknown"})`} (${elapsed}ms)`,
    );
  });
  return promise.finally(() => {
    inFlightAllocations.delete(kind);
  });
}

/**
 * Claim a set of resource allowances from the host. Each surfaces the host's
 * modal on first run; cached per page lifetime. Sequential to keep the modal
 * sequence predictable; a single denial does not abort the rest.
 */
export function claimResourceAllowances(
  kinds: readonly ResourceAllowanceKind[],
  options: { timeoutMs?: number } = {},
): Promise<readonly ResourceAllowanceOutcome[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (!isInHost()) return Promise.resolve([]);
  const timeoutMs = options.timeoutMs ?? ALLOC_TIMEOUT_MS;
  // Fire sequentially so the host modal chain doesn't stack.
  return (async () => {
    const out: ResourceAllowanceOutcome[] = [];
    for (const kind of kinds) {
      out.push(await claimOneAllowance(kind, timeoutMs));
    }
    return out;
  })();
}

/** Read the cached outcomes of prior `claimResourceAllowances` calls. */
export function getResourceAllowanceOutcomes(): readonly ResourceAllowanceOutcome[] {
  return Array.from(allocationOutcomes.values());
}
