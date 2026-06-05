// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Merchants-feature query keys; shared so all observers hit one cache entry. */

export const merchantKeys = {
  /** On-chain merchant directory, keyed by dry-run origin so an origin flip re-reads. */
  table: (origin: string) => ["merchant-table", origin] as const,
} as const;
