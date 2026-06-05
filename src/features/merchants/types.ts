// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Shared merchant-table types. Own module so the chain reader and the
 * resolution pipeline share one source of truth without a circular import.
 * `MerchantTable` is keyed by `identityKey(merchantId, terminalId)`.
 */

import type { MerchantDestination } from "@/features/merchants/lib/destination.ts";
import type { MerchantLifecycle } from "@/features/merchants/lib/onchain-loader.ts";

export interface MerchantEntry {
  merchantId: string;
  terminalId: string;
  destination: MerchantDestination;
  displayName: string;
  /**
   * `"active"` is payable, `"paused"` is registered but disabled. Revoked
   * merchants are filtered out by the loader and never appear in the table.
   */
  status: MerchantLifecycle;
  /** ISO-8601. Captured from the on-chain `addedAt` (unix seconds). */
  addedAt: string;
}

export type MerchantTable = Record<string, MerchantEntry>;
