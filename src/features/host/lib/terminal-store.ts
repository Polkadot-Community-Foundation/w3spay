// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Process-wide W3SPay `KvStore` singleton — plain client state with no React
 * lifecycle, so a module singleton is simpler and avoids the ref-population
 * race a hook had on first render.
 */

import { createTerminalStore, type KvStore } from "@/shared/utils/kv-store.ts";

let store: KvStore | null = null;

/** The shared W3SPay-scoped store. Created on first access. */
export function getTerminalStore(): KvStore {
  store ??= createTerminalStore("w3spay");
  return store;
}
