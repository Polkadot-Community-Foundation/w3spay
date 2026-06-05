// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * H160 address helpers for the contract-call boundary. w3spay reads only, so it
 * does shape validation only — SS58/AccountId32 derivation is skipped to avoid
 * pulling `@noble/hashes` + `@polkadot-api/substrate-bindings` as new deps.
 */

import { isHexString } from "ethers";

/** Branded type for a 0x-prefixed 20-byte H160. */
export type H160Hex = `0x${string}`;

/** Branded type for a 0x-prefixed 32-byte AccountId32 (substrate native). */
export type AccountId32Hex = `0x${string}`;

export class InvalidAdminAddressError extends Error {
  constructor(value: string) {
    super(`address must be a 0x-prefixed H160; got ${value}`);
    this.name = "InvalidAdminAddressError";
  }
}

export function isH160Address(value: string): boolean {
  return isHexString(value, 20);
}

export function normalizeH160Address(value: string): H160Hex {
  if (!isH160Address(value)) throw new InvalidAdminAddressError(value);
  return value.toLowerCase() as H160Hex;
}
