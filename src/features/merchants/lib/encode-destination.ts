// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Encode a 20-byte H160 destination (0x-prefixed) into the 32-byte
 * `AccountId32` the mobile Host API payment path accepts.
 *
 * The Android host decodes `paymentRequest.destination` as a 32-byte
 * AccountId and submits a native transfer; H160 as-is is the wrong length,
 * and the `0xEE × 12 ‖ H160` pallet-revive mapping yields a different
 * AccountId the native path can't settle to. For RFC-0006 payer payments
 * H160 rows use the standard left-padded AccountId32:
 *
 *   `0x00 × 12 ‖ H160`
 *
 * Uses ethers' `zeroPadValue` + `getBytes` as the source of truth: there
 * is no Polkadot SDK equivalent — substrate's H160 → AccountId32 mappings
 * are `0xEE × 12 ‖ H160` (pallet-revive) or `blake2_256("evm:" ‖ H160)`
 * (Frontier), neither of which the native payment path expects.
 */

import { getBytes, isHexString, zeroPadValue } from "ethers";

const H160_BYTE_LENGTH = 20;
const ACCOUNT_ID_32_BYTE_LENGTH = 32;

export function encodeReviveContractDestination(
  smartContractAddress: string,
): Uint8Array {
  if (!isHexString(smartContractAddress, H160_BYTE_LENGTH)) {
    throw new InvalidContractAddressError(
      `revive contract address must be a 0x-prefixed ${H160_BYTE_LENGTH}-byte hex string, got "${smartContractAddress}"`,
    );
  }
  return getBytes(zeroPadValue(smartContractAddress, ACCOUNT_ID_32_BYTE_LENGTH));
}

export class InvalidContractAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidContractAddressError";
  }
}
