// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

import type { ComponentType } from "react";

import { isIOS } from "@/shared/api/host";

import { WasmScanner } from "@/features/scan/components/WasmScanner.tsx";
import type { ScannerError } from "@/features/scan/lib/scanner-types.ts";

export interface ScannerProps {
  onDecoded: (text: string) => void;
  onPermissionDenied?: () => void;
  onStartError?: (error: ScannerError) => void;
}

/**
 * `ANDROID_USES_WASM` stays `false`: the WASM scanner hangs in the TUA-shell
 * WebView between `getUserMedia` and `loadedmetadata` with no error surfaced
 * (spinner stuck on "Starting camera…"). iOS is unaffected — it has no native
 * `BarcodeDetector` QR path and must use WASM. Flipping to `true` reproduces
 * the hang.
 */

/**
 * Platform picker for the scan surface.
 *
 *   - iOS → `WasmScanner` (always): no native `BarcodeDetector` QR path, so the
 *     Worker-hosted ZXing-C++ WASM decoder is the only off-main-thread option.
 *   - Android/desktop → `WasmScanner` while `ANDROID_USES_WASM`, else
 *     `AndroidScanner` (native `BarcodeDetector`, single start, no retry).
 *
 * Resolved ONCE at module load: `isIOS()` reads `navigator.userAgent`, stable
 * for the tab's lifetime, so a runtime flip is impossible without a reload.
 */
function pickScannerComponent(): ComponentType<ScannerProps> {
  if (isIOS()) return WasmScanner;
  return WasmScanner;
}

const ScannerImpl: ComponentType<ScannerProps> = pickScannerComponent();

export function Scanner(props: ScannerProps) {
  return <ScannerImpl {...props} />;
}
