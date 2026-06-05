// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Camera-permission store (Zustand).
 *
 * `useCameraPermission` is per-instance and fires a host permission probe on
 * mount, so it MUST be called from exactly one place or the modal double-fires.
 * `<HostBridge>` owns that single call and publishes here; the routing gate and
 * scan screen read it without re-probing. Holds the probe `state` plus the
 * `retry` action the "camera needed" screen calls after the user fixes the grant.
 */

import { create } from "zustand";

import type { CameraPermissionState } from "@/shared/api/host";

interface CameraStore {
  readonly state: CameraPermissionState;
  /** Re-probe the host grant. Bound to the live `useCameraPermission().retry`. */
  retry(): void | Promise<void>;
  /** Publish a fresh probe state + retry binding (called by `<HostBridge>`). */
  publish(next: { state: CameraPermissionState; retry: () => void | Promise<void> }): void;
}

export const useCameraStore = create<CameraStore>((set) => ({
  state: { kind: "pending" },
  retry: () => {},
  publish: ({ state, retry }) => set({ state, retry }),
}));
