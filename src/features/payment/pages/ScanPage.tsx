// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Index page — boot splash while the scan flow resolves, else the live `<ScanningScreen>`.
 *
 * Camera permission is probed here, not at boot: deferring means the iOS native camera
 * sheet only appears after the balance (payment-permission) modal closes — no modal
 * collision. Probe gated on `balancePermissionResolved`; scanner start gated on
 * `cameraGranted` so `<video>` never mounts before iOS grants.
 */

import { useEffect } from "react";

import { useNavigate } from "@tanstack/react-router";
import { useCameraPermission } from "@/shared/api/host";

import { PATHS } from "@/app/router/routes.ts";
import { UNSUPPORTED_SCAN_GRACE_MS } from "@/features/payment/lib/stage.ts";
import { usePaymentActions } from "@/features/payment/lib/payment-actions.ts";
import { useSessionStore } from "@/features/payment/store/session-store.ts";
import { ScanningScreen } from "@/features/payment/components/ScanningScreen.tsx";
import { useCameraStore } from "@/features/scan/store/camera-store.ts";
import { usePaymentBalanceDerived } from "@/features/host/api/balance.ts";
import { BootScreen } from "@/features/host/components/BootScreen.tsx";
import { journeyTracker } from "@/shared/utils/telemetry.ts";

export function ScanPage() {
  const resolving = useSessionStore((s) => s.resolving);
  return resolving ? <BootScreen /> : <ScanningView />;
}

function ScanningView() {
  const actions = usePaymentActions();
  const navigate = useNavigate();
  const { availableCents, balancePermissionResolved } = usePaymentBalanceDerived();

  // Single call site for `useCameraPermission`; result published to `useCameraStore`
  // so the root gate and the CameraDenied screen can both read it.
  const cameraPermission = useCameraPermission({ enabled: balancePermissionResolved });
  const publishCamera = useCameraStore((s) => s.publish);
  const retry = useCameraStore((s) => s.retry);
  useEffect(() => {
    publishCamera({ state: cameraPermission.state, retry: cameraPermission.retry });
  }, [cameraPermission.state, cameraPermission.retry, publishCamera]);

  // Gate the scanner on an explicit grant — `pending`/`host-unavailable` mean the probe
  // hasn't resolved, and starting early would call getUserMedia before the grant.
  const cameraGranted = cameraPermission.state.kind === "granted";

  // Scan-grace lifecycle: open the qr-scan journey on entry, fall back if no valid TSE
  // lands within the grace window, and abandon the journey on any other exit.
  useEffect(() => {
    useSessionStore.getState().setLastBadScan(null);
    journeyTracker.start("qr-scan");
    const timeoutId = window.setTimeout(
      () => actions.flushScanGrace(),
      UNSUPPORTED_SCAN_GRACE_MS,
    );
    return () => {
      window.clearTimeout(timeoutId);
      if (journeyTracker.isActive("qr-scan")) {
        journeyTracker.fail("qr-scan", "abandoned");
      }
    };
  }, [actions]);

  return (
    <ScanningScreen
      onDecoded={actions.handleDecoded}
      onPermissionDenied={() => void retry()}
      onScannerStartError={(error) =>
        actions.goToStage({ kind: "cameraError", message: error.message })
      }
      onOpenWallet={() => void navigate({ to: PATHS.wallet, search: { tab: "activity" } })}
      availableCents={availableCents}
      permissionsReady={balancePermissionResolved && cameraGranted}
    />
  );
}
