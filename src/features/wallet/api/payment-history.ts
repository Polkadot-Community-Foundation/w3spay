// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Local payment-history mirror — KvStore-backed, newest-first index of
 * successful payments on this device. Read by `WalletScreen` (Activity tab),
 * appended by `App.tsx#performPayment`. The host owns the canonical receipts;
 * this is a UI cache, not a fiscal record.
 *
 * Storage envelope:
 *   key:   `PAYMENT_HISTORY_KEY` (currently "w3spay:payment-history:v2")
 *   value: JSON.stringify({ schemaVersion, entries: PaymentRecord[] })
 *
 * Capped at `PAYMENT_HISTORY_MAX_ENTRIES` (oldest tail trimmed). Schema-version
 * bumps drop the previous envelope on read — no migration path.
 */

import { envConfig } from "@/config";

const PAYMENT_HISTORY_KEY = envConfig.storage.paymentHistoryKey;
const PAYMENT_HISTORY_MAX_ENTRIES = envConfig.storage.paymentHistoryMaxEntries;
const PAYMENT_HISTORY_SCHEMA_VERSION = envConfig.storage.paymentHistorySchemaVersion;
import type { KvStore } from "@/shared/utils/kv-store.ts";

export { PAYMENT_HISTORY_KEY };

export interface PaymentRecord {
  /** Host-issued payment ID (RFC 0017). */
  paymentId: string;
  /**
   * 32-byte AccountId32 destination, lowercase `0x`-prefixed hex. Captured at
   * payment time so history survives a registry rotation and the dev-pay flow
   * (no merchant entry) can still record the (address, amount, date) triple.
   */
  destination: string;
  /**
   * Total charged, integer cents (TSE subtotal + tip on merchant flow; raw
   * amount on dev flow). Pre-tip entries match the subtotal.
   */
  amountCents: number;
  /** Tip in integer cents on top of the subtotal; absent ⇒ no tip. */
  tipCents?: number;
  /** Wall-clock at the time we recorded the success, ISO string. */
  paidAt: string;
  /**
   * Settlement state.
   *  - `paid`        — host confirmed settlement.
   *  - `refunded`    — flipped into refunded territory by the customer-side flow.
   *  - `unconfirmed` — request accepted but the settlement subscription dropped
   *    before a terminal status. Money may have moved on chain; reconcile via
   *    the host vault.
   */
  status: "paid" | "refunded" | "unconfirmed";
  /**
   * Merchant directory metadata captured at payment time. All optional (dev-pay
   * has no entry) — best-effort context, not a source of truth.
   */
  merchantDisplayName?: string;
  merchantId?: string;
  terminalId?: string;
  /** TSE receipt identifiers — let the user reconcile against the paper slip. */
  kassenSerial?: string;
  transactionNumber?: string;
  /** Verbatim receipt-QR text. Optional; detail view hides its QR section when absent. */
  rawQrText?: string;
}

interface HistoryEnvelope {
  schemaVersion: typeof PAYMENT_HISTORY_SCHEMA_VERSION;
  entries: PaymentRecord[];
}

export async function readPaymentHistory(store: KvStore | null): Promise<PaymentRecord[]> {
  if (store == null) return [];
  const raw = await store.get(PAYMENT_HISTORY_KEY).catch(() => null);
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as HistoryEnvelope;
    if (parsed.schemaVersion !== PAYMENT_HISTORY_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
      return [];
    }
    return parsed.entries;
  } catch {
    return [];
  }
}

export async function appendPayment(
  store: KvStore | null,
  record: PaymentRecord,
): Promise<void> {
  if (store == null) return;
  const existing = await readPaymentHistory(store);
  const next = [record, ...existing].slice(0, PAYMENT_HISTORY_MAX_ENTRIES);
  const envelope: HistoryEnvelope = {
    schemaVersion: PAYMENT_HISTORY_SCHEMA_VERSION,
    entries: next,
  };
  try {
    await store.set(PAYMENT_HISTORY_KEY, JSON.stringify(envelope));
  } catch {
    // History is best-effort — a write failure must never block the payment UI.
  }
}

export function formatHistoryDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = `${d.getDate()} ${months[d.getMonth()]}`;
  const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  return { date, time };
}

/** Truncate a payment ID to "0xa8f1…29bc" form for the meta rows. */
export function shortPaymentId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/** Sum of all paid amounts, in cents. */
export function sumPaidCents(records: readonly PaymentRecord[]): number {
  let total = 0;
  for (const r of records) {
    if (r.status === "paid") total += r.amountCents;
  }
  return total;
}
