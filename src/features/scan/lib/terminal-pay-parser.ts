// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Parser for the t3rminal pay deeplink QR:
 *   polkadotapp://pay?address=<SS58>&amount=<PLANKS>[&lockAmount=<bool>]&terminalId=<STRING>
 *
 * Strict and total: returns ParsedTerminalPayQr or throws TerminalPayParseError.
 * `amount` is plancks (smallest unit), converted to cents via envConfig.token.plancksPerCent.
 */

import { getSs58AddressInfo } from "polkadot-api";

import { envConfig } from "@/config";

export interface ParsedTerminalPayQr {
  /** Original SS58 address from the QR. */
  readonly addressSs58: string;
  /** Decoded `0x`-prefixed 32-byte hex AccountId32. */
  readonly addressHex: string;
  /** Raw planks value as parsed from the URL. */
  readonly amountPlanks: number;
  /** Amount in cents: Math.floor(amountPlanks / plancksPerCent). */
  readonly amountCents: number;
  /** Terminal identifier for merchant registry lookup. */
  readonly terminalId: string;
  /** Whether the payer app should lock the amount (UI hint, not enforced). */
  readonly lockAmount: boolean;
}

export class TerminalPayParseError extends Error {
  constructor(
    readonly code: TerminalPayParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TerminalPayParseError";
  }
}

export type TerminalPayParseErrorCode =
  | "missingAddress"
  | "invalidAddress"
  | "missingAmount"
  | "invalidAmount"
  | "nonPositiveAmount"
  | "missingTerminalId";

/**
 * Parse a polkadotapp://pay deeplink QR payload; throws TerminalPayParseError.
 *
 * Uses URLSearchParams on only the query portion rather than the URL
 * constructor, which mishandles non-standard schemes.
 */
export function parseTerminalPayQr(raw: string): ParsedTerminalPayQr {
  const queryStart = raw.indexOf("?");
  const params = new URLSearchParams(queryStart >= 0 ? raw.slice(queryStart + 1) : raw);

  const addressSs58 = params.get("address") ?? "";
  if (!addressSs58) {
    throw new TerminalPayParseError("missingAddress", "Missing 'address' parameter");
  }
  const info = getSs58AddressInfo(addressSs58);
  if (!info.isValid || info.publicKey.length !== 32) {
    throw new TerminalPayParseError(
      "invalidAddress",
      `Invalid SS58 address: ${addressSs58}`,
    );
  }
  let addressHex = "0x";
  for (const byte of info.publicKey) {
    addressHex += byte.toString(16).padStart(2, "0");
  }

  const amountStr = params.get("amount") ?? "";
  if (!amountStr) {
    throw new TerminalPayParseError("missingAmount", "Missing 'amount' parameter");
  }
  if (!/^\d+$/.test(amountStr)) {
    throw new TerminalPayParseError(
      "invalidAmount",
      `Amount must be a non-negative integer, got: ${amountStr}`,
    );
  }
  const amountPlanks = Number(amountStr);
  if (amountPlanks <= 0) {
    throw new TerminalPayParseError("nonPositiveAmount", "Amount must be greater than zero");
  }
  const amountCents = Math.floor(amountPlanks / envConfig.token.plancksPerCent);

  const terminalId = params.get("terminalId") ?? "";
  if (!terminalId) {
    throw new TerminalPayParseError("missingTerminalId", "Missing 'terminalId' parameter");
  }

  const lockAmount = params.get("lockAmount") === "true";

  return { addressSs58, addressHex, amountPlanks, amountCents, terminalId, lockAmount };
}
