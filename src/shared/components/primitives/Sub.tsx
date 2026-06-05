// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Short paragraph following the <Dotted /> divider beneath a <Head>; `small` size variant. */

import type { ReactNode } from "react";

export interface SubProps {
  children: ReactNode;
  small?: boolean;
}

export function Sub({ children, small }: SubProps) {
  return <p className={small ? "editorial-sub editorial-sub--small" : "editorial-sub"}>{children}</p>;
}
