// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Rear-camera acquisition primitive — shared by both scanner backends.
 *
 * Intentionally NOT a scanner: no `<video>`, no decode loop, no React
 * lifecycle. The one place that calls `getUserMedia`, rides out the
 * post-`track.stop()` busy window, and classifies raw `DOMException`s into
 * stable `ScannerError` codes.
 *
 * The iOS and Android flows are otherwise fully separate; they share THIS
 * module only because the transient-error back-off and fail-fast
 * classification took device testing to get right — duplicating it would let
 * the copies drift on the subtle parts.
 */

import { ScannerError } from "@/features/scan/lib/scanner-types.ts";

/**
 * Result of a pre-warm attempt. On success bind the stream; on failure inspect
 * `error` to decide between a typed error (terminal causes like denied
 * permission) and a library fallback (recoverable/unknown — see `shouldFailFast`).
 *
 * Tracking the last error is the point: a library's own acquisition swallows
 * every getUserMedia rejection into a flat `"Camera not found."`, obliterating
 * "denied permission" vs "no camera" and routing both to the same screen.
 */
export type AcquireResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; error: Error | null };

/**
 * Ask the browser for the rear camera with no resolution constraints — just
 * `facingMode: "environment"`.
 *
 * We dropped the prior 1080p→720p→bare tier cascade: it caused unrecoverable
 * rejections on the Android TUA WebView, and "more source pixels" was illusory
 * — the decoder downscales to DECODE_CANVAS_CAP=2048 after the central-square
 * crop, so anything above ~2K is binned before ZXing/BarcodeDetector. The bare
 * request is the one every device supports.
 *
 * Returns the live stream or the raw `getUserMedia` error for the caller to
 * classify.
 *
 * @internal exported for testing — see camera-stream.test.ts
 */
export async function acquireRearStream(): Promise<AcquireResult> {
  if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia == null) {
    return {
      ok: false,
      error: new Error("getUserMedia is not available in this runtime"),
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "environment" },
    });
    return { ok: true, stream };
  } catch (caught) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    console.warn(`[w3spay/scanner] getUserMedia rejected: ${error.name}: ${error.message}`);
    return { ok: false, error };
  }
}

/**
 * Camera errors that mean "try again in a moment", not "give up".
 *
 * iOS/WKWebView releases the camera ASYNCHRONOUSLY after `track.stop()` (older
 * Android Chrome WebViews too, after the host relinquishes a stream). A
 * `getUserMedia` issued before teardown completes rejects with
 * `NotReadableError` — older WebKit spells it `AbortError`. This is the "comes
 * back for a moment, then fails again" retry loop: the camera IS available, we
 * asked a beat too early.
 *
 * @internal exported for testing — see camera-stream.test.ts
 */
export function isTransientCameraError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotReadableError" || error.name === "AbortError")
  );
}

/**
 * Back-off schedule (ms) for the post-stop busy window. Kept short: the iOS
 * scanner component retries `cameraUnavailable` itself, so this only covers the
 * typical iOS WKWebView async-release race; stretching it froze the "Starting
 * camera…" spinner.
 */
const CAMERA_BUSY_RETRY_DELAYS_MS = [250, 500, 1000] as const;

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * `acquireRearStream` wrapped in a transient-retry back-off.
 *
 * On Android TUA the host's `handleDevicePermission("Camera")` validation
 * stream races our `getUserMedia` (→ `NotReadableError`); on iOS WKWebView the
 * same race follows a scanner remount (prior `track.stop()` settles async). We
 * ride it out with a short back-off and re-acquire.
 *
 * Opens exactly ONE `MediaStream` per attempt, never a second overlapping
 * `getUserMedia`: a second stream to "upgrade" lenses while the first is live
 * wedges the iOS camera into a `NotReadableError` that only a full reload
 * clears. We take whatever lens `facingMode: environment` resolves to.
 *
 * Non-transient failures (permission denied, no camera) return immediately.
 *
 * @internal exported for testing — see camera-stream.test.ts
 */
export async function acquireRearStreamWithRetry(): Promise<AcquireResult> {
  let result = await acquireRearStream();
  for (const backoffMs of CAMERA_BUSY_RETRY_DELAYS_MS) {
    if (
      result.ok ||
      result.error == null ||
      !isTransientCameraError(result.error)
    ) {
      return result;
    }
    console.warn(
      `[w3spay/scanner] transient camera error; backing off ${backoffMs}ms`,
    );
    await delay(backoffMs);
    result = await acquireRearStream();
  }
  return result;
}

/**
 * `true` when a pre-warm error is terminal enough not to hand off to a
 * library's own getUserMedia fallback. Denied permission, missing camera, and
 * missing API won't recover from a retry — the library would just lose our
 * error context and throw "Camera not found." Unknown errors fall through so a
 * device-specific failure still gets the library's relaxing-cascade second chance.
 *
 * @internal exported for testing — see camera-stream.test.ts
 */
export function shouldFailFast(error: Error): boolean {
  if (error.name === "NotAllowedError") return true;
  if (error.name === "NotFoundError") return true;
  if (error.name === "SecurityError") return true;
  if (/getUserMedia is not available/i.test(error.message)) return true;
  return false;
}

/** Stop every track on `stream`, swallowing per-track teardown errors. */
export function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Map a raw camera-acquisition error onto a stable `ScannerError` code so the
 * UI can branch on intent (permission denied vs no camera vs generic) without
 * reading the raw message.
 *
 * Handles both a `DOMException` (NotAllowedError, NotFoundError,
 * OverconstrainedError, NotReadableError) and the flat `"Camera not found."`
 * string a library re-throws when its fallback is exhausted.
 *
 * @internal exported for testing — see camera-stream.test.ts
 */
export function classifyStartError(caught: unknown): ScannerError {
  if (caught instanceof ScannerError) return caught;
  if (caught instanceof Error && caught.name === "NotAllowedError") {
    return new ScannerError("permissionDenied", caught.message, caught);
  }
  if (
    caught instanceof Error &&
    (caught.name === "NotFoundError" ||
      caught.name === "OverconstrainedError" ||
      caught.name === "NotReadableError")
  ) {
    return new ScannerError("cameraUnavailable", caught.message, caught);
  }
  const message = caught instanceof Error ? caught.message : String(caught);
  if (/NotAllowedError|Permission/i.test(message)) {
    return new ScannerError("permissionDenied", message, caught);
  }
  if (/NotFoundError|OverconstrainedError|Camera not found/i.test(message)) {
    return new ScannerError("cameraUnavailable", message, caught);
  }
  return new ScannerError("startFailed", message, caught);
}
