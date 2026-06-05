// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Guard: is a scanner host element a *live* surface worth opening the camera
 * for, or a transition ghost to leave alone?
 *
 * `<ScreenTransition>` keeps the leaving screen mounted ~280 ms to crossfade
 * out, under a new key wrapped in `aria-hidden="true"`. That copy mounts a
 * *second* scanner whose effect races the live one for the single camera
 * session. On iOS this is fatal: the camera releases asynchronously after
 * `track.stop()`, so the second `getUserMedia` lands mid-release and rejects
 * with `NotReadableError`.
 *
 * Rule: live iff connected to the document AND not inside an
 * `aria-hidden="true"` subtree (the marker on the leaving slot).
 *
 * Deliberately NOT gated on box size: a zero-size host is only ever a layout
 * bug, and gating on it is a footgun — a transiently-collapsed-but-live box
 * (an aspect-ratio reflow quirk) would hang the spinner. Decoders don't need a
 * sized host: qr-scanner probes its own rect, the WASM backend captures from
 * the video's source dimensions.
 */
export function isLiveScanHost(host: HTMLElement | null): host is HTMLElement {
  if (host == null) return false;
  if (!host.isConnected) return false;
  return host.closest('[aria-hidden="true"]') == null;
}
