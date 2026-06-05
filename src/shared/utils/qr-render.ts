// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Render text as a QR code SVG string for the receipt detail view. SVG mode
 * keeps the code sharp at any size and inherits the stone palette; it renders on
 * its own warm-white card since light-on-dark would clash with the dark chrome.
 */

import QRCode from "qrcode";

const QR_OPTIONS = {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  color: {
    dark: "#1c1917",
    light: "#fafaf9",
  },
} as const;

export async function renderQrSvg(text: string): Promise<string> {
  return QRCode.toString(text, QR_OPTIONS);
}
