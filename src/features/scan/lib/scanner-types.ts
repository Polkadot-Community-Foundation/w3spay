// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Shared scanner contract so the rest of the app never branches on platform.
 * Two fully-separate flows sit underneath, sharing only this contract and the
 * `camera-stream.ts` primitive:
 *
 *   - WASM → `components/WasmScanner.tsx` + `backend-zxing-wasm.ts`. ZXing-C++
 *     WASM in a Worker, component-level auto-retry. Mandatory on iOS (no native
 *     BarcodeDetector QR path for web content) and the Android default.
 *   - Native → `components/AndroidScanner.tsx` + `backend-qr-scanner.ts`. Bare
 *     `<video>` + `getUserMedia` + native `BarcodeDetector`, single start, no
 *     retry loop. Android alternative when `ANDROID_USES_WASM` is `false`.
 *
 * Platform dispatch happens once in `components/Scanner.tsx` via `isIOS()`.
 */

/** Stable error codes the UI branches on (permission vs hardware vs other). */
export type ScannerErrorCode =
  | "cameraUnavailable"
  | "permissionDenied"
  | "startFailed"
  | "scanFailed";

/**
 * Domain error from both backends. The raw `DOMException` (when present) is
 * preserved on `cause` so logging shows the real failure (`NotReadableError`,
 * `OverconstrainedError`, …) without the UI knowing WebRTC primitives.
 */
export class ScannerError extends Error {
  constructor(
    public readonly code: ScannerErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ScannerError";
  }
}

/** Caller-provided callbacks. `onError` is best-effort live-scan signal. */
export interface ScannerCallbacks {
  onDecoded(text: string): void;
  onError?(error: ScannerError): void;
}

/** Handle returned by a backend start; `stop()` is idempotent and never throws. */
export interface ScannerHandle {
  stop(): Promise<void>;
}
