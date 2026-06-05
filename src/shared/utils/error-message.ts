// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Error-message rendering for the payment failure screen.
 *
 * Host-API errors (`@novasamatech/scale` `Err` codec) carry the real host-side
 * reason on `error.payload.reason`. `PaymentRequestErr.Unknown` has a static
 * `message` (`"unknown error"`), so surfacing the payload is the only way to see
 * the real cause (e.g. dotli's `CoinagePaymentError.message`, Android transfer failure).
 */

export function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const reason = scaleErrReason(error);
    if (reason) return reason;
    if (error.message) return error.message;
  }
  return fallback;
}

export function scaleErrReason(error: Error): string | null {
  const payload = (error as { payload?: unknown }).payload;
  if (payload && typeof payload === "object" && "reason" in payload) {
    const reason = (payload as { reason?: unknown }).reason;
    if (typeof reason === "string" && reason.length > 0) return reason;
  }
  return null;
}
