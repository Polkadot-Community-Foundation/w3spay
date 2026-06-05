// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Runtime platform detection. Kept out of `config.ts` because detection is
 * DOM-based, not env-based.
 */

import { detectHostEnvironment } from "@/shared/api/host";

/**
 * The four distinct runtime contexts W3sPay can load in.
 *
 *   - `mobile`       — Polkadot Mobile native webview (TUA shell). The
 *                      primary target; `pointer: coarse`, standalone env.
 *   - `desktop`      — Desktop browser tab (pointer: fine, standalone).
 *   - `desktop-app`  — Polkadot Desktop webview (`__HOST_WEBVIEW_MARK__`).
 *   - `dotli`        — dot.li iframe (`window !== window.top`).
 *
 * Used by `features.supportedPlatforms` to gate the app before any host
 * hooks or queries run.
 */
export type Platform = "mobile" | "desktop" | "desktop-app" | "dotli";

/**
 * Detect the current runtime platform. Synchronous and stable for the
 * page lifetime — safe to call at module load.
 */
export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "mobile";
  const env = detectHostEnvironment();
  if (env === "desktop-webview") return "desktop-app";
  if (env === "web-iframe") return "dotli";
  // Standalone: distinguish by primary pointer device.
  // `pointer: fine` = mouse / trackpad → desktop browser.
  // `pointer: coarse` = touch → mobile native webview.
  return window.matchMedia("(pointer: fine)").matches ? "desktop" : "mobile";
}
