// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Wallet overlay — the record-keeping surface reached from the scan / done
 * screens. Two tabs: `activity` (payment history) and `receipts` (saved
 * purchase receipts). The active tab is a search param; panels read the local
 * KvStore via TanStack Query, so writes whose mutation invalidated those keys
 * show up without manual refresh. Tapping a row navigates to the id-addressed
 * detail route; this component only reports the record via `onOpen*`.
 */

import {
  formatHistoryDate,
  sumPaidCents,
  type PaymentRecord,
} from "@/features/wallet/api/payment-history.ts";
import type { ReceiptRecord } from "@/features/wallet/api/receipts.ts";
import { usePaymentHistory, useReceipts } from "@/features/wallet/api/queries.ts";
import { formatAmountCents } from "@/shared/utils/format-amount.ts";
import {
  Dotted,
  Eyebrow,
  Frame,
  Head,
  IconButton,
} from "@/shared/components/primitives.tsx";
import { ASSET_LABEL, shortHex, splitDisplayName } from "@/shared/utils/format.ts";

export type WalletTab = "activity" | "receipts";

export interface WalletScreenProps {
  activeTab: WalletTab;
  onChangeTab: (tab: WalletTab) => void;
  onBack: () => void;
  onOpenPaymentRecord: (record: PaymentRecord) => void;
  onOpenReceiptRecord: (record: ReceiptRecord) => void;
  /** Customer's current spendable balance in cents, or `null` while loading. */
  availableBalanceCents: number | null;
}

export function WalletScreen({
  activeTab,
  onChangeTab,
  onBack,
  onOpenPaymentRecord,
  onOpenReceiptRecord,
  availableBalanceCents,
}: WalletScreenProps) {
  return (
    <Frame>
      <div style={{ position: "absolute", top: 60, right: 18, zIndex: 4 }}>
        <IconButton onClick={onBack} label="Close" icon="x" />
      </div>

      <WalletTabs active={activeTab} onChange={onChangeTab} />

      <div className="wallet-panels">
        <div
          className={activeTab === "activity" ? "wallet-panel wallet-panel--active" : "wallet-panel"}
          aria-hidden={activeTab !== "activity"}
          inert={activeTab !== "activity"}
        >
          <ActivityPanel
            onOpenRecord={onOpenPaymentRecord}
            availableBalanceCents={availableBalanceCents}
          />
        </div>
        <div
          className={activeTab === "receipts" ? "wallet-panel wallet-panel--active" : "wallet-panel"}
          aria-hidden={activeTab !== "receipts"}
          inert={activeTab !== "receipts"}
        >
          <ReceiptsPanel onOpenRecord={onOpenReceiptRecord} />
        </div>
      </div>
    </Frame>
  );
}

interface WalletTabsProps {
  active: WalletTab;
  onChange: (tab: WalletTab) => void;
}

function WalletTabs({ active, onChange }: WalletTabsProps) {
  return (
    <div className="wallet-tabs" role="tablist" aria-label="Wallet sections">
      <WalletTab id="activity" active={active} onSelect={onChange}>
        Activity
      </WalletTab>
      <WalletTab id="receipts" active={active} onSelect={onChange}>
        Receipts
      </WalletTab>
    </div>
  );
}

interface WalletTabButtonProps {
  id: WalletTab;
  active: WalletTab;
  onSelect: (tab: WalletTab) => void;
  children: string;
}

function WalletTab({ id, active, onSelect, children }: WalletTabButtonProps) {
  const isActive = id === active;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={isActive ? "wallet-tabs__tab wallet-tabs__tab--active" : "wallet-tabs__tab"}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}

interface ActivityPanelProps {
  onOpenRecord: (record: PaymentRecord) => void;
  availableBalanceCents: number | null;
}

function ActivityPanel({ onOpenRecord, availableBalanceCents }: ActivityPanelProps) {
  const { data } = usePaymentHistory();
  const records = data ?? null;

  const totalCents = records ? sumPaidCents(records) : 0;
  const paidCount = records ? records.filter((r) => r.status === "paid").length : 0;
  const balanceLabel =
    availableBalanceCents !== null
      ? `${formatAmountCents(availableBalanceCents)} ${ASSET_LABEL}`
      : "—";

  return (
    <>
      <Eyebrow>This device</Eyebrow>
      <div className="history__head">
        <Head size={40} italic>
          Activity.
        </Head>
        <span className="history__total">
          {paidCount} · {formatAmountCents(totalCents)} {ASSET_LABEL}
        </span>
      </div>

      <Dotted style={{ marginTop: 18 }} />

      <div className="history__balance-line">
        <Eyebrow>Balance</Eyebrow>
        <span className="history__balance-amount">{balanceLabel}</span>
      </div>

      <Dotted />

      <div className="history__list">
        {records === null ? (
          <div className="history__empty">Loading…</div>
        ) : records.length === 0 ? (
          <div className="history__empty">No payments yet. Scan a receipt to get started.</div>
        ) : (
          records.map((r, i) => (
            <PaymentRow
              key={`${r.paymentId}-${i}`}
              record={r}
              divider={i < records.length - 1}
              onOpen={() => onOpenRecord(r)}
            />
          ))
        )}
      </div>
    </>
  );
}

interface PaymentRowProps {
  record: PaymentRecord;
  divider: boolean;
  onOpen: () => void;
}

function PaymentRow({ record, divider, onOpen }: PaymentRowProps) {
  // Fall back to the shortened destination for dev-pay records (no merchant
  // entry); `splitDisplayName` doesn't accept undefined.
  const heading = record.merchantDisplayName ?? shortHex(record.destination);
  const { name, venue } = splitDisplayName(heading);
  const { date, time } = formatHistoryDate(record.paidAt);
  // Three tones: `paid` → debit, `refunded` → credit (sign flips, warn label),
  // `unconfirmed` → debit but reads `submitted` in warn tone to prompt reconcile.
  const isRefund = record.status === "refunded";
  const isUnconfirmed = record.status === "unconfirmed";
  const sign = isRefund ? "+" : "−";
  const amountCls = isRefund
    ? "history__amount history__amount--refund"
    : isUnconfirmed
      ? "history__amount history__amount--refund"
      : "history__amount";
  const statusCls = isRefund || isUnconfirmed
    ? "history__status history__status--refund"
    : "history__status";
  const statusLabel = isUnconfirmed ? "submitted" : record.status;
  return (
    <>
      <button type="button" className="history__row" onClick={onOpen}>
        <div>
          <div className="history__merchant">{name}</div>
          <div className="history__meta">
            {venue ? `${venue} · ` : ""}
            {date}, {time}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className={amountCls}>
            {sign}{formatAmountCents(record.amountCents)} {ASSET_LABEL}
          </div>
          <div className={statusCls}>{statusLabel}</div>
        </div>
      </button>
      {divider ? <Dotted style={{ margin: 0 }} /> : null}
    </>
  );
}

interface ReceiptsPanelProps {
  onOpenRecord: (record: ReceiptRecord) => void;
}

function ReceiptsPanel({ onOpenRecord }: ReceiptsPanelProps) {
  const { data } = useReceipts();
  const records = data ?? null;

  const count = records?.length ?? 0;

  return (
    <>
      <Eyebrow>Saved on this device</Eyebrow>
      <div className="history__head">
        <Head size={40} italic>
          Receipts.
        </Head>
        <span className="history__total">
          {count} {count === 1 ? "receipt" : "receipts"}
        </span>
      </div>

      <Dotted style={{ marginTop: 18 }} />

      <div className="history__list">
        {records === null ? (
          <div className="history__empty">Loading…</div>
        ) : records.length === 0 ? (
          <div className="history__empty">No receipts yet. Scan a receipt code to save one.</div>
        ) : (
          records.map((r, i) => (
            <ReceiptRow
              key={`${r.receipt.saleId}-${i}`}
              record={r}
              divider={i < records.length - 1}
              onOpen={() => onOpenRecord(r)}
            />
          ))
        )}
      </div>
    </>
  );
}

interface ReceiptRowProps {
  record: ReceiptRecord;
  divider: boolean;
  onOpen: () => void;
}

function ReceiptRow({ record, divider, onOpen }: ReceiptRowProps) {
  const { receipt } = record;
  const { name, venue } = splitDisplayName(receipt.business.name);
  const { date, time } = formatHistoryDate(record.savedAt);
  const itemCount = receipt.items.length;
  return (
    <>
      <button type="button" className="history__row" onClick={onOpen}>
        <div>
          <div className="history__merchant">{name}</div>
          <div className="history__meta">
            {venue ? `${venue} · ` : ""}
            {date}, {time}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="history__amount">
            {formatAmountCents(receipt.amountCents)} {receipt.currency}
          </div>
          <div className="history__status">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </div>
        </div>
      </button>
      {divider ? <Dotted style={{ margin: 0 }} /> : null}
    </>
  );
}
