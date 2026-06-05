// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Single facade over the Novasama Host API SDK. Import host-sdk primitives
 * through this module, not `@novasamatech/host-api-wrapper` directly: the
 * wrapper owns a module-level transport singleton and assigns the Desktop
 * webview `MessagePort.onmessage` handler, so bundling multiple physical
 * copies makes those handlers clobber each other and drop handshake responses.
 */
export {
  createPaymentManager,
  hostApi,
  hostLocalStorage,
  preimageManager,
  requestPermission,
  sandboxProvider,
  sandboxTransport,
} from "@novasamatech/host-api-wrapper";
export type { PaymentStatus, ProductAccount } from "@novasamatech/host-api-wrapper";

export { assertEnumVariant, enumValue } from "@novasamatech/host-api";
export type { HexString } from "@novasamatech/host-api";
