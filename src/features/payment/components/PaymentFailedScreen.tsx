// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Payment failed — host rejected or settlement threw; nothing was charged.
 * Retry returns to confirm (not rescan) with the same payload — idempotent,
 * since a prior succeeded write routes to `alreadyPaid` on rescan anyway, and
 * we avoid asking the customer to re-aim at the QR. New scan abandons it.
 */

import {
  Dotted,
  Eyebrow,
  Frame,
  Head,
  Icon,
  MetaRow,
  PrimaryButton,
  SecondaryButton,
  Sub,
} from "@/shared/components/primitives.tsx";
import { ASSET_LABEL } from "@/shared/utils/format.ts";
import { formatAmountCents } from "@/shared/utils/format-amount.ts";

export interface PaymentFailedScreenProps {
  /** Retry — go back to confirm with the stage payload reused. */
  onRetry: () => void;
  /** Cancel — walk back to the camera. */
  onCancel: () => void;
  message: string;
  amountCents: number;
}

export function PaymentFailedScreen({
  onRetry,
  onCancel,
  amountCents,
  message,
}: PaymentFailedScreenProps) {
  return (
    <Frame
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PrimaryButton onClick={onRetry}>
            <Icon name="check" size={16} />
            Try again
          </PrimaryButton>
          <SecondaryButton onClick={onCancel}>
            <Icon name="scan" size={16} />
            New scan
          </SecondaryButton>
        </div>
      }
    >
      <Eyebrow tone="danger">Try again</Eyebrow>
      <div style={{ marginTop: 14 }}>
        <Head size={44} suffix="couldn't go through." suffixTone="danger">
          Payment
        </Head>
      </div>
      <Dotted style={{ marginTop: 22 }} />
      <Sub>
        Nothing was charged. {message ? `${message} ` : ""}Tap "Try again" to retry the same
        receipt, or "New scan" to start over.
      </Sub>
      <div style={{ flex: 1 }} />
      <Dotted />
      <dl style={{ margin: 0 }}>
        <MetaRow label="Amount" value={`${formatAmountCents(amountCents)} ${ASSET_LABEL}`} mono />
      </dl>
      <div style={{ paddingBottom: 6 }} />
    </Frame>
  );
}
