// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** `<dt>/<dd>` fact line for pay/done/receipt screens; `mono` renders the value monospace. */

import type { ReactNode } from "react";

export interface MetaRowProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function MetaRow({ label, value, mono }: MetaRowProps) {
  const valueClass = mono ? "meta-row__value meta-row__value--mono" : "meta-row__value";
  return (
    <div className="meta-row">
      <dt className="meta-row__label">{label}</dt>
      <dd className={valueClass}>{value}</dd>
    </div>
  );
}
