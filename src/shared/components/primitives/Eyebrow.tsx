// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Small all-caps label above a <Head>; `tone` tints it for warn/danger/success. */

import type { ReactNode } from "react";

export type EyebrowTone = "muted" | "warn" | "danger" | "success";

export interface EyebrowProps {
  children: ReactNode;
  tone?: EyebrowTone;
}

export function Eyebrow({ children, tone = "muted" }: EyebrowProps) {
  const cls = tone === "muted" ? "eyebrow" : `eyebrow eyebrow--${tone}`;
  return <p className={cls}>{children}</p>;
}
