// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Shared low-level types for the pallet-revive helpers. `getUnsafeApi()`
 * returns runtime-API results as `unknown`, so each helper casts at the
 * boundary into these shapes; `getTypedApi()` would obviate the casts but
 * couple every helper to one chain's metadata.
 */

/** Shape of `ReviveApi.call(...)` dry-run response. */
export interface ReviveCallDryRun {
  readonly weight_required: {
    readonly ref_time: bigint;
    readonly proof_size: bigint;
  };
  readonly storage_deposit: {
    readonly type: "Charge" | "Refund";
    readonly value: bigint;
  };
  readonly result:
    | {
        readonly success: true;
        readonly value: {
          readonly flags: number;
          readonly data: Uint8Array;
        };
      }
    | {
        readonly success: false;
        readonly value: unknown;
      };
}

/**
 * `sp_weights::Weight` (v2) for the `gasLimit` arg of `ReviveApi.call`.
 * Required for nested CALL frames (e.g. Multicall3.aggregate3); pass
 * `undefined` for top-level reads.
 */
export interface WeightV2 {
  readonly ref_time: bigint;
  readonly proof_size: bigint;
}

/** Narrowed view of `getUnsafeApi().apis.ReviveApi` — the two methods we touch. */
export interface ReviveApiShim {
  call(
    origin: string,
    dest: string,
    value: bigint,
    gasLimit: WeightV2 | undefined,
    storageDepositLimit: bigint | undefined,
    data: Uint8Array,
    opts?: { at?: "best" | "finalized" },
  ): Promise<ReviveCallDryRun>;
  address(ss58: string): Promise<`0x${string}` | null | undefined>;
}
