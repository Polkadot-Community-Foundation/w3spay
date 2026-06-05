// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Host permission React surface. `useCameraPermission` probes the host's
 * camera grant once at mount and exposes a stable `state` plus a `retry()`.
 *
 * Why probe at boot rather than lazily in the scanner: on dot.li the iframe's
 * `allow="camera"` is only set after the user accepts the host modal, so
 * firing the modal at boot avoids a "scanning UI → bounce to needs-camera"
 * flash, and centralises permission state for the routing layer.
 *
 * Sequencing: dot.li shows one host modal at a time, so the caller passes
 * `enabled` to defer the probe until prior modals close (state stays
 * `pending` while `enabled === false`). The probe also waits for
 * `useHostWalletSnapshot().isReady` so the camera modal doesn't fire before
 * the handshake completes.
 *
 * **No OS-level exercise.** We do NOT call `getUserMedia` here to verify the
 * grant — on platforms with an "Allow once" option that would kill the grant
 * before the scanner uses it, forcing a re-prompt. The scanner backend
 * classifies its own `getUserMedia` failures (`classifyStartError`) and
 * retries the transient `cameraUnavailable` case, so a stale OS grant is
 * recovered without burning a prompt.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { requestCameraPermission, resetCameraPermissionCache } from "./connection.ts";
import { useHostWalletSnapshot } from "./wallet.ts";

export type CameraPermissionOutcome =
  /** Iframe `allow="camera"` is set; safe to call getUserMedia. */
  | { kind: "granted" }
  /** User explicitly denied (or dot.li is about to reload the iframe). */
  | { kind: "denied" };

export type CameraPermissionState =
  | { kind: "pending" }
  | { kind: "host-unavailable" }
  | CameraPermissionOutcome;

export interface UseCameraPermissionResult {
  readonly state: CameraPermissionState;
  /**
   * Re-probe the host. Idempotent and safe to call concurrently — the
   * second concurrent call is dropped. After the SDK has cached a
   * grant/denial this returns near-instantly without re-prompting.
   */
  retry(): Promise<void>;
}

export interface UseCameraPermissionOptions {
  /**
   * Defer the probe until prior host modals have settled. Set this to the
   * resolution of any earlier permission modal so the camera modal doesn't
   * race it — dot.li would silently drop the second one.
   */
  enabled: boolean;
}

/** Decision the gate hands back to the hook. `probe` means "ask the host". */
export type CameraGateDecision =
  | { kind: "pending" }
  | { kind: "granted" }
  | { kind: "host-unavailable" }
  | { kind: "probe" };

/**
 * Pure gate for the camera-permission probe. Extracted from the effect so the
 * transition table is testable without React or a host bridge:
 *   - `enabled === false`  → `pending`
 *   - outside a host       → `granted` (browser getUserMedia owns the prompt)
 *   - host not ready       → `host-unavailable`
 *   - otherwise            → `probe`
 */
export function cameraPermissionGate(input: {
  enabled: boolean;
  isOutsideHost: boolean;
  isReady: boolean;
}): CameraGateDecision {
  if (!input.enabled) return { kind: "pending" };
  if (input.isOutsideHost) return { kind: "granted" };
  if (!input.isReady) return { kind: "host-unavailable" };
  return { kind: "probe" };
}


export function useCameraPermission(
  options: UseCameraPermissionOptions,
): UseCameraPermissionResult {
  const { enabled } = options;
  const [state, setState] = useState<CameraPermissionState>({ kind: "pending" });
  const inFlightRef = useRef(false);
  const wallet = useHostWalletSnapshot();

  const probe = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Retry path drops the `enabled` gate — the user explicitly asked.
      const decision = cameraPermissionGate({
        enabled: true,
        isOutsideHost: wallet.isOutsideHost,
        isReady: wallet.isReady,
      });
      if (decision.kind !== "probe") {
        // `pending` can't surface here (enabled is forced true), so this is
        // either `granted` (outside host) or `host-unavailable` (not ready).
        setState(decision);
        return;
      }
      let granted: boolean;
      try {
        granted = await requestCameraPermission();
      } catch (caught) {
        // Defensive — `requestCameraPermission()` uses `.match()`
        // internally and should not throw, but a future SDK revision
        // could. Treat as "no host, proceed" so the browser's native
        // getUserMedia prompt can take over.
        console.warn("[sdk/camera-permission] probe threw", caught);
        granted = true;
      }
      setState(granted ? { kind: "granted" } : { kind: "denied" });
    } finally {
      inFlightRef.current = false;
    }
  }, [wallet.isOutsideHost, wallet.isReady]);

  // Retry surface for `CameraDeniedScreen`: the user has (presumably)
  // fixed their grant in host settings, so the cached "granted" answer
  // (if any) is stale. Clear it before re-probing so the host modal
  // re-fires and the truth wins.
  const retry = useCallback(async () => {
    resetCameraPermissionCache();
    await probe();
  }, [probe]);

  useEffect(() => {
    const decision = cameraPermissionGate({
      enabled,
      isOutsideHost: wallet.isOutsideHost,
      isReady: wallet.isReady,
    });
    if (decision.kind === "probe") {
      void probe();
      return;
    }
    // `pending` while still deferring keeps the initial state; the
    // terminal `granted` / `host-unavailable` decisions are set directly.
    if (decision.kind !== "pending") {
      setState(decision);
    }
  }, [enabled, wallet.isOutsideHost, wallet.isReady, probe]);

  return { state, retry };
}
