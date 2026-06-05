// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Tip selection — pure logic. Everything is expressed in **cents** to match
 * the rest of `pay/` (the TSE parser normalises receipt amounts to integer
 * cents); doing the math in EUR floats would re-introduce the rounding bugs
 * the cent-based pipeline avoids.
 */

/**
 * Tip presets in percent. Order drives the chip grid order; 0% comes last
 * as the explicit "no tip" escape hatch, not the default suggestion.
 */
export const TIP_PRESETS: readonly number[] = [7, 10, 15, 0];

/** Default selection when the tip screen first opens. */
export const DEFAULT_TIP_PERCENT = 10;

/**
 * Sanity cap for custom tip input, in cents (999_999 == €9,999.99): beyond
 * this is almost certainly a typo, and clamping keeps the math bounded.
 */
export const MAX_CUSTOM_TIP_CENTS = 999_999;

/**
 * What the user selected on the tip screen. The screen carries both —
 * the active `kind` is what feeds `computeTipCents`; the inactive one is
 * remembered so the chip and the custom field can both light up
 * independently when the customer toggles between them.
 */
export type TipSelection =
  | { kind: "preset"; percent: number }
  | { kind: "custom"; cents: number };

/**
 * Resolve the tip amount in integer cents for a given subtotal. Preset rounds
 * `subtotal * percent / 100` half-up ("10% of €2.55" → 26 cents, not 25);
 * custom passes through, clamped to `[0, MAX_CUSTOM_TIP_CENTS]`.
 *
 * @throws TypeError if `subtotalCents` isn't a non-negative integer —
 *   defending here prevents float drift from leaking in.
 */
export function computeTipCents(
  subtotalCents: number,
  selection: TipSelection,
): number {
  if (
    !Number.isFinite(subtotalCents) ||
    !Number.isInteger(subtotalCents) ||
    subtotalCents < 0
  ) {
    throw new TypeError(
      `computeTipCents expects a non-negative integer subtotal, got ${subtotalCents}`,
    );
  }
  if (selection.kind === "preset") {
    if (selection.percent <= 0) return 0;
    return Math.round((subtotalCents * selection.percent) / 100);
  }
  const c = selection.cents;
  if (!Number.isFinite(c) || c <= 0) return 0;
  return Math.min(MAX_CUSTOM_TIP_CENTS, Math.trunc(c));
}

/**
 * Parse a user-typed custom tip string into integer cents. Accepts German
 * (`1,50`) and dot (`1.50`) separators and sub-euro shortforms (`.99`).
 * Returns `null` for empty/unparseable input (caller treats as "no tip yet",
 * without locking Continue); parsed cents clamped to `[0, MAX_CUSTOM_TIP_CENTS]`.
 */
export function parseCustomTipInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // German locale: comma as decimal separator. Replace and accept either.
  const normalized = trimmed.replace(",", ".");
  // Strict: digits with at most one decimal point and at most 2 fractional digits.
  // Permits "1", "1.", "1.5", "1.50", ".5", ".50" — rejects "1.500", "1.2.3", "abc".
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return null;
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber) || asNumber < 0) return null;
  const cents = Math.round(asNumber * 100);
  if (cents < 0) return null;
  return Math.min(MAX_CUSTOM_TIP_CENTS, cents);
}

/**
 * Whole-percent display ("12%") for a tip vs its subtotal. Returns 0 for a
 * 0 tip. Rounds half-up so the displayed amount matches the percent label.
 */
export function tipPercentLabel(subtotalCents: number, tipCents: number): number {
  if (tipCents <= 0 || subtotalCents <= 0) return 0;
  return Math.round((tipCents / subtotalCents) * 100);
}

/**
 * Sanitize a raw input so it can only hold a parseable euro amount: drop
 * non-digit/separator chars, collapse extra separators (`"1.5.5"` → `"1.55"`),
 * cap the fractional part at two digits — kept in lock-step with
 * `parseCustomTipInput`. Preserves the first separator typed (German comma
 * stays visible).
 */
export function sanitizeCustomTipInput(raw: string): string {
  let next = raw.replace(/[^0-9.,]/g, "");
  const sepIdx = next.search(/[.,]/);
  if (sepIdx >= 0) {
    const intPart = next.slice(0, sepIdx + 1);
    const fracPart = next.slice(sepIdx + 1).replace(/[.,]/g, "").slice(0, 2);
    next = intPart + fracPart;
  }
  return next;
}
