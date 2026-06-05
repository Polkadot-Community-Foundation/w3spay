// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Shared editorial primitives barrel — re-exports the per-primitive files under
 * `primitives/` so callers stay flat.
 */

export { Dotted } from "@/shared/components/primitives/Dotted.tsx";
export { Eyebrow, type EyebrowProps, type EyebrowTone } from "@/shared/components/primitives/Eyebrow.tsx";
export { Frame, type FrameProps, Rail } from "@/shared/components/primitives/Frame.tsx";
export { Head, type HeadProps } from "@/shared/components/primitives/Head.tsx";
export {
  Icon,
  ICONS,
  type IconName,
  type IconProps,
} from "@/shared/components/primitives/Icon.tsx";
export { Mark, type MarkProps } from "@/shared/components/primitives/Mark.tsx";
export { MetaRow, type MetaRowProps } from "@/shared/components/primitives/MetaRow.tsx";
export { Step, type StepProps } from "@/shared/components/primitives/Step.tsx";
export { Sub, type SubProps } from "@/shared/components/primitives/Sub.tsx";
export {
  IconButton,
  type IconButtonProps,
  PrimaryButton,
  SecondaryButton,
  type ButtonProps,
} from "@/shared/components/primitives/buttons.tsx";
