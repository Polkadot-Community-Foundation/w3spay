// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Mapped-account check for pallet-revive: derive the H160 via
 * `ReviveApi.address(ss58)`, then read `Revive.OriginalAccount[h160]`.
 *
 * Any failure or stall (past `MAPPING_READ_TIMEOUT_MS`) is treated as
 * unmapped — harmless, since the caller's `map_account` then errors
 * `AccountAlreadyMapped`, which `writeContract` swallows. Bounding the reads
 * keeps a flaky RPC from freezing the write at "preparing".
 */

import type { PolkadotClient } from "polkadot-api";

import { reviveApi } from "./read.ts";
import { withTimeout } from "./with-timeout.ts";

const MAPPING_READ_TIMEOUT_MS = 10_000;

/** Narrow view of `query.Revive.OriginalAccount`. */
interface ReviveOriginalAccountQuery {
  readonly Revive?: {
    readonly OriginalAccount?: {
      getValue(key: string): Promise<unknown>;
    };
  };
}

export async function isAccountMapped(
  client: PolkadotClient,
  walletAddress: string,
): Promise<boolean> {
  const unsafeApi = client.getUnsafeApi();
  try {
    const h160 = await withTimeout(
      reviveApi(unsafeApi).address(walletAddress),
      MAPPING_READ_TIMEOUT_MS,
      "ReviveApi.address",
    );
    if (h160 == null) return false;

    const query = (unsafeApi as { query: ReviveOriginalAccountQuery }).query;
    const entry = query.Revive?.OriginalAccount?.getValue(h160);
    if (entry == null) return false;

    const original = await withTimeout(
      entry,
      MAPPING_READ_TIMEOUT_MS,
      "Revive.OriginalAccount",
    );
    return original != null;
  } catch {
    return false;
  }
}
