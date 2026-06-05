// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Android scanner backend — bare `<video>` + `getUserMedia` + native
 * `BarcodeDetector`. No external library, no constraint cascade: a single
 * rear-camera stream (`facingMode: "environment"`, no size/fps hints) polled
 * by the platform decoder.
 *
 * Why not Nimiq's `qr-scanner`: it laundered every `getUserMedia` failure into
 * a flat `"Camera not found."` string, destroying error classification, and
 * forced our pre-warm to coordinate stream lifetime with the library. Going
 * direct deletes that layer; the decoder is unchanged (`qr-scanner` used
 * `BarcodeDetector` on Android Chrome anyway).
 *
 * NotReadableError busy-window: the Android TUA shell's
 * `handleDevicePermission("Camera")` opens a brief native validation stream
 * whose release races our `getUserMedia`, which rejects with
 * `NotReadableError`. We retry with a back-off so the window is invisible.
 *
 * iOS Safari/WKWebView does NOT expose QR detection, so iOS routes to
 * `WasmScanner` + `backend-zxing-wasm.ts`; this backend is never reached there.
 *
 * StrictMode: every start serializes through `startupQueue`; the prior scanner
 * is torn down (stream stopped, host cleared) before the new one acquires.
 */

import {
  classifyStartError,
  isTransientCameraError,
  stopStream,
} from "@/features/scan/lib/camera-stream.ts";
import {
  ScannerError,
  type ScannerCallbacks,
  type ScannerHandle,
} from "@/features/scan/lib/scanner-types.ts";

// `BarcodeDetector` isn't in TypeScript's stock lib.dom; model only the
// surface we use.

interface DetectedBarcode {
  readonly rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<readonly DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (init?: {
  readonly formats?: readonly string[];
}) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return ctor ?? null;
}

interface ActiveScan {
  readonly stream: MediaStream;
  readonly video: HTMLVideoElement;
  stop(): void;
}

let active: ActiveScan | null = null;
let startupQueue: Promise<void> = Promise.resolve();

/** Polling interval — 10 detect/sec matches the previous library cadence. */
const DETECT_INTERVAL_MS = 100;

/**
 * Back-off schedule (ms) for the post-permission busy window. Longer than
 * camera-stream.ts's: the Android TUA host's validation stream can hold the
 * camera past 2 s on some devices, so 1.75 s wasn't enough.
 */
const CAMERA_BUSY_RETRY_DELAYS_MS = [500, 1000, 2000, 3000] as const;

function clearHostChildren(host: HTMLElement): void {
  while (host.firstChild) host.removeChild(host.firstChild);
}

/**
 * Mount a fresh `<video>` inside `host`. `playsinline` keeps the
 * WebView from forcing fullscreen on play; `muted` + `autoplay` let
 * the play promise resolve without a user gesture.
 */
function mountVideoInside(host: HTMLElement): HTMLVideoElement {
  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;
  video.autoplay = true;
  video.setAttribute("width", "100%");
  video.setAttribute("height", "100%");
  host.appendChild(video);
  return video;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * Single bare `getUserMedia` for the rear camera, retrying only on
 * transient busy-window errors (`NotReadableError` / `AbortError`).
 * Anything else — `NotAllowedError`, `NotFoundError`, etc. — is fatal
 * and returns immediately so the UI can route to the right screen
 * without 7+ seconds of false hope first.
 */
async function acquireRearCamera(): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: { facingMode: "environment" },
  };
  let lastError: unknown;
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (caught) {
    lastError = caught;
    console.warn(
      `[w3spay/scanner] getUserMedia rejected: ${formatError(caught)}`,
    );
    if (!isTransientCameraError(caught)) throw caught;
  }
  for (const backoffMs of CAMERA_BUSY_RETRY_DELAYS_MS) {
    console.warn(`[w3spay/scanner] camera busy; backing off ${backoffMs}ms`);
    await delay(backoffMs);
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (caught) {
      lastError = caught;
      console.warn(
        `[w3spay/scanner] getUserMedia rejected after back-off: ${formatError(caught)}`,
      );
      if (!isTransientCameraError(caught)) throw caught;
    }
  }
  throw lastError;
}

function formatError(caught: unknown): string {
  if (caught instanceof Error) return `${caught.name}: ${caught.message}`;
  return String(caught);
}

/**
 * Start the rear-camera scanner inside `host` (must be in the DOM and laid
 * out). Resolves with a `ScannerHandle` whose `stop()` is idempotent.
 */
export async function startQrScannerLibScanner(
  host: HTMLElement,
  callbacks: ScannerCallbacks,
): Promise<ScannerHandle> {
  const Detector = getBarcodeDetector();
  if (Detector == null) {
    throw new ScannerError(
      "startFailed",
      "BarcodeDetector is not available in this browser",
    );
  }

  const myTurn = startupQueue.catch(() => undefined).then(async () => {
    // Tear down the previous scanner before re-acquiring: track.stop() must
    // settle before the new getUserMedia or we race into NotReadableError.
    if (active != null) {
      const previous = active;
      active = null;
      previous.stop();
    }
    clearHostChildren(host);
    const video = mountVideoInside(host);

    let stream: MediaStream;
    try {
      stream = await acquireRearCamera();
    } catch (caught) {
      clearHostChildren(host);
      throw classifyStartError(caught);
    }

    video.srcObject = stream;
    try {
      await video.play();
    } catch (caught) {
      stopStream(stream);
      video.srcObject = null;
      clearHostChildren(host);
      throw classifyStartError(caught);
    }

    const detector = new Detector({ formats: ["qr_code"] });
    let stopped = false;
    let lastPayload: string | null = null;
    let timeoutId: number | null = null;

    const tick = async (): Promise<void> => {
      if (stopped) return;
      try {
        const results = await detector.detect(video);
        const first = results.find((r) => r.rawValue.length > 0);
        if (first != null && first.rawValue !== lastPayload) {
          lastPayload = first.rawValue;
          console.info(`[w3spay/scanner] decoded QR text: ${first.rawValue}`);
          callbacks.onDecoded(first.rawValue);
        }
      } catch {
        // BarcodeDetector throws when the frame isn't ready (paused,
        // unmounted, mid-resize); keep polling, a later frame recovers.
      }
      if (!stopped) {
        timeoutId = window.setTimeout(() => void tick(), DETECT_INTERVAL_MS);
      }
    };
    timeoutId = window.setTimeout(() => void tick(), DETECT_INTERVAL_MS);

    const stop = (): void => {
      stopped = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      stopStream(stream);
      video.srcObject = null;
    };

    active = { stream, video, stop };
    return { stop };
  });

  // Swallow errors so a failed start doesn't poison the queue for later callers.
  startupQueue = myTurn.then(
    () => undefined,
    () => undefined,
  );

  const { stop } = await myTurn;

  return {
    async stop() {
      if (active?.stop !== stop) return;
      const previous = active;
      active = null;
      previous.stop();
      clearHostChildren(host);
    },
  };
}
