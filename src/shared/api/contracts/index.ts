// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * `@/sdk/contracts` — generic pallet-revive contract helpers. Each takes a
 * `PolkadotClient` first so one module drives any chain; pass the same
 * client across coordinating helpers (the genesis-hash-keyed
 * `getOrCreateClient` cache makes this automatic at the app layer).
 */

export {
  reviveApi,
  readContract,
  stringifyResultValue,
  type ReadContractOptions,
} from "./read.ts";

export type { ReviveCallDryRun, WeightV2 } from "./types.ts";

export {
  writeContract,
  type WriteContractOptions,
} from "./write-contract.ts";

export {
  watchTransaction,
  type ChainEffectOracle,
  type TxStatus,
  type WatchableTx,
  type WatchTransactionOptions,
} from "./watch-transaction.ts";

export { isAccountMapped } from "./account-mapping.ts";

export {
  batchRead,
  type BatchReadOptions,
  type ReadCall,
} from "./multicall.ts";
