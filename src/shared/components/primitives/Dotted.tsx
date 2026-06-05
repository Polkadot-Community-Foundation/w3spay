// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** Horizontal dotted divider for editorial sectioning. */

import type { CSSProperties } from "react";

export function Dotted({ style }: { style?: CSSProperties }) {
  return <div className="dotted" style={style} />;
}
