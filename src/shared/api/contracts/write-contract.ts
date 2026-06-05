// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Generic contract write over pallet-revive: `writeContract` dry-runs
 * `ReviveApi.call(...)` for gas estimation, optionally prepends a standalone
 * `Revive.map_account` when the wallet is unmapped, submits
 * `pallet_revive::call`, and watches it to finalization.
 *
 * Telemetry is intentionally not wired here — wrap from outside to capture
 * dry-run exceptions; the dry-run path still `console.warn`s.
 */

import { Interface, type InterfaceAbi } from "ethers";
import { Binary, type PolkadotClient, type PolkadotSigner } from "polkadot-api";

import { isAccountMapped } from "./account-mapping.ts";
import { reviveApi, stringifyResultValue } from "./read.ts";
import {
  watchTransaction,
  type ChainEffectOracle,
  type TxStatus,
  type WatchableTx,
} from "./watch-transaction.ts";
import { withTimeout } from "./with-timeout.ts";

/** Narrowed view of `getUnsafeApi().tx.Revive` — PAPI types `.tx` as `unknown`; the cast boundary. */
interface ReviveTxShim {
  call(params: {
    dest: string;
    value: bigint;
    weight_limit: { ref_time: bigint; proof_size: bigint };
    storage_deposit_limit: bigint;
    data: Uint8Array;
  }): WatchableTx;
  map_account(): WatchableTx;
}

function reviveTx(unsafeApi: unknown): ReviveTxShim {
  return (unsafeApi as { tx: { Revive: ReviveTxShim } }).tx.Revive;
}

/**
 * `map_account` errors `AccountAlreadyMapped` on a racy `isAccountMapped`
 * read — benign, so callers treat it as success and proceed to the call.
 */
function isAlreadyMappedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /AccountAlreadyMapped/i.test(message);
}

function formatParsedErrorArg(value: unknown): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function decodeDryRunRevertReason(
  iface: Interface,
  data: `0x${string}`,
): string | null {
  if (data === "0x") return null;

  try {
    const parsed = iface.parseError(data);
    if (parsed != null) {
      if (parsed.name === "Error" && parsed.args.length === 1) {
        return String(parsed.args[0]);
      }
      const args = Array.from(parsed.args, formatParsedErrorArg).join(", ");
      return args === "" ? parsed.name : `${parsed.name}(${args})`;
    }
  } catch {
    // Fall through to the raw data fallback below.
  }

  return null;
}

function dryRunRevertMessage(
  iface: Interface,
  functionName: string,
  data: Uint8Array,
): string {
  const revertHex = Binary.toHex(data) as `0x${string}`;
  const reason = decodeDryRunRevertReason(iface, revertHex);
  if (reason != null && reason !== "") {
    return `contract ${functionName} dry-run reverted: ${reason}`;
  }
  return revertHex === "0x"
    ? `contract ${functionName} dry-run reverted`
    : `contract ${functionName} dry-run reverted (data=${revertHex})`;
}

/**
 * Headroom on dry-run outputs before they become real tx limits. Weight 1.5×:
 * benchmarks already carry margin (variance <10%), covers a runtime upgrade
 * landing between simulation and submission. Storage 1.25×: byte-deterministic,
 * cheap cover for concurrent writes to the same slot.
 */
const WEIGHT_MULTIPLIER_NUM = 3n;
const WEIGHT_MULTIPLIER_DEN = 2n;
const STORAGE_MULTIPLIER_NUM = 5n;
const STORAGE_MULTIPLIER_DEN = 4n;

/** Conservative storage deposit limit for dry-run estimation (50 DOT). */
const DRY_RUN_STORAGE_DEPOSIT = 500_000_000_000n;

/**
 * Cap the gas-estimation dry-run. A hung `ReviveApi.call` would freeze the
 * write at "preparing" and the signature prompt would never appear; on
 * timeout we fall through to the conservative FALLBACK_* limits and sign.
 */
const DRY_RUN_TIMEOUT_MS = 20_000;

/**
 * Last-resort limits when the dry-run can't run (unmapped account —
 * pallet-revive rejects the runtime API with `AccountUnmapped`, and a
 * synthetic stand-in has no balance to cover storage deposits).
 */
const FALLBACK_WEIGHT_LIMIT = { ref_time: 500_000_000_000n, proof_size: 3_000_000n };
const FALLBACK_STORAGE_DEPOSIT = 50_000_000_000n;

export interface WriteContractOptions {
  readonly address: `0x${string}`;
  readonly abi: InterfaceAbi;
  readonly functionName: string;
  readonly args?: readonly unknown[];
  readonly value?: bigint;
  readonly signer: PolkadotSigner;
  /** SS58 wallet address — used as dry-run origin and mapping check. */
  readonly walletAddress: string;
  readonly onStatus?: (status: TxStatus) => void;
  /**
   * Inclusion oracle for the contract call (NOT the `Revive.map_account`
   * pre-step). Polled after `broadcasted` to detect inclusion via state read
   * — workaround for chains whose host bridge never delivers
   * `txBestBlocksState`. See `watch-transaction.ts`. Without it the UI hangs
   * at `"broadcasting"` until the watchdog fires.
   */
  readonly waitForChainEffect?: ChainEffectOracle;
}

/**
 * Submit a state-changing contract call via `pallet_revive::call`:
 * mapped-check, dry-run for gas + revert detection (mapped accounts only),
 * then submit — prepending a standalone `Revive.map_account` (not
 * `Utility.batch_all`) when unmapped — and watch to inclusion.
 */
export async function writeContract(
  client: PolkadotClient,
  options: WriteContractOptions,
): Promise<`0x${string}`> {
  const {
    address,
    abi,
    functionName,
    args = [],
    value,
    signer,
    walletAddress,
    onStatus,
  } = options;

  onStatus?.("preparing");

  const iface = new Interface(abi);
  const calldata = iface.encodeFunctionData(functionName, args) as `0x${string}`;
  const unsafeApi = client.getUnsafeApi();
  const destLower = address.toLowerCase() as `0x${string}`;
  const txValue = value ?? 0n;

  const isMapped = await isAccountMapped(client, walletAddress);

  // Dry-run is only viable for mapped accounts: pallet-revive rejects unmapped
  // SS58 origins with `AccountUnmapped`, and a stand-in holds no balance to
  // cover storage deposits. Unmapped callers fall through to FALLBACK_*.
  let weightLimit: { ref_time: bigint; proof_size: bigint } | undefined;
  let storageDepositLimit: bigint | undefined;
  let dryRunRevertError: string | null = null;
  if (isMapped) {
    try {
      const dryRun = await withTimeout(
        reviveApi(unsafeApi).call(
          walletAddress,
          destLower,
          txValue,
          undefined,
          DRY_RUN_STORAGE_DEPOSIT,
          Binary.fromHex(calldata),
        ),
        DRY_RUN_TIMEOUT_MS,
        `${functionName} dry-run`,
      );
      if (dryRun.result.success && (dryRun.result.value.flags & 1) === 0) {
        weightLimit = {
          ref_time:
            (dryRun.weight_required.ref_time * WEIGHT_MULTIPLIER_NUM) / WEIGHT_MULTIPLIER_DEN,
          proof_size:
            (dryRun.weight_required.proof_size * WEIGHT_MULTIPLIER_NUM) / WEIGHT_MULTIPLIER_DEN,
        };
        storageDepositLimit =
          dryRun.storage_deposit.value > 0n
            ? (dryRun.storage_deposit.value * STORAGE_MULTIPLIER_NUM) / STORAGE_MULTIPLIER_DEN
            : DRY_RUN_STORAGE_DEPOSIT;
      } else if (dryRun.result.success) {
        dryRunRevertError = dryRunRevertMessage(
          iface,
          functionName,
          dryRun.result.value.data,
        );
      } else {
        dryRunRevertError = `contract ${functionName} dry-run failed: ${stringifyResultValue(
          dryRun.result.value,
        )}`;
      }
    } catch (caught) {
      // Dry-run throws fall through to FALLBACK_* limits — the call often
      // still succeeds at runtime, but a throw is operationally interesting
      // (RPC instability or a missing chain-state feature). Logged here.
      console.warn(
        `[writeContract] ${functionName} dry-run threw; using conservative estimates:`,
        caught,
      );
    }
  }

  if (dryRunRevertError != null) {
    throw new Error(dryRunRevertError);
  }

  if (weightLimit == null || storageDepositLimit == null) {
    weightLimit = FALLBACK_WEIGHT_LIMIT;
    storageDepositLimit = FALLBACK_STORAGE_DEPOSIT;
  }

  const contractCall = reviveTx(unsafeApi).call({
    dest: destLower,
    value: txValue,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    data: Binary.fromHex(calldata),
  });

  // pallet-revive rejects calls from an unmapped SS58 origin, so a fresh
  // product account's first write MUST map it once (the host may show a
  // `Revive.map_account` signature before `Revive.call`). Kept as a standalone
  // extrinsic, not `Utility.batch_all`, so the two operations are explicit and
  // we avoid nested-call signing/display bugs. A racy unmapped read is harmless
  // — `map_account` then errors `AccountAlreadyMapped`, which we swallow.
  if (!isMapped) {
    try {
      // `map_account`'s effect oracle is the same check that flips `isMapped`,
      // so a broken chain follow doesn't strand us at "broadcasting".
      await watchTransaction(
        reviveTx(unsafeApi).map_account(),
        signer,
        onStatus,
        { waitForChainEffect: () => isAccountMapped(client, walletAddress) },
      );
    } catch (caught) {
      if (!isAlreadyMappedError(caught)) throw caught;
    }
  }

  return watchTransaction(contractCall, signer, onStatus, {
    waitForChainEffect: options.waitForChainEffect,
  });
}
