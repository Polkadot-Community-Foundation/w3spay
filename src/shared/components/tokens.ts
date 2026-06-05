// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Typed alias for the CSS-variable design palette. The CSS source of truth is
 * `src/styles.css`; values here are purely cosmetic — keep names in sync.
 */

export const tokens = {
  bg: "var(--color-bg)",
  bgSubtle: "var(--color-bg-subtle)",
  textPrimary: "var(--color-text-primary)",
  textSecondary: "var(--color-text-secondary)",
  textTertiary: "var(--color-text-tertiary)",
  textMuted: "var(--color-text-muted)",
  textFaint: "var(--color-text-faint)",
  fontSerif: "var(--font-serif)",
  fontMono: "var(--font-mono)",
} as const;

export type Tokens = typeof tokens;
