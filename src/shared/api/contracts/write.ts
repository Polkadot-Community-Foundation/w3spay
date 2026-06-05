// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Barrel re-export of the contract write surface (`writeContract` +
 * `watchTransaction`).
 */

export { writeContract, type WriteContractOptions } from "./write-contract.ts";
export {
  watchTransaction,
  type ChainEffectOracle,
  type TxStatus,
  type WatchableTx,
  type WatchTransactionOptions,
} from "./watch-transaction.ts";
