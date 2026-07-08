// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Resolved-once env config singleton. The actual env parsing lives in
 * `@/shared/config/read-env.ts`; this module is a thin wrapper that
 * triggers the read at app boot and re-exports the result.
 */

import { parseNetworkKey, type NetworkKey } from "@/shared/api/host";
import { envFlag, envString, requireEnvString } from "@/shared/lib/config";
import { type EnvConfig, parseSupportedPlatforms } from "@/shared/lib/config.ts";


const DEFAULT_W3SPAY_NETWORK: NetworkKey = "paseo-next";

// Deployed `W3SPayRegistry` per network (published by w3spay-admin). The active
// default follows the resolved network so an env-unset build never inherits
// another chain's address (a summit build must NOT bake the paseo registry —
// that H160 has no contract on Summit AH). Override per deploy via
// VITE_W3SPAY_REGISTRY_ADDRESS. Networks without a known registry resolve to ""
// → the loader skips the chain step and falls back to the cached snapshot.
const DEFAULT_REGISTRY_BY_NETWORK: Partial<Record<NetworkKey, string>> = {
  summit: "0xf76dadbbc112738275ed398d15c0e8c47b2550f2",
  "paseo-next": "0x13a885e6c402cc293ae7185dcacbd824d109aee6", // PCF W3SPayRegistry on AH-next 1500 (owner 5Fk8)
};

export function readEnv(): EnvConfig {
  const decimals = 6;
  const displayDecimals = 2;
  const network =
    parseNetworkKey(import.meta.env.VITE_NETWORK as string | undefined) ?? DEFAULT_W3SPAY_NETWORK;
  return {
    contracts: {
      merchantRegistryAddress: envString(
        "VITE_W3SPAY_REGISTRY_ADDRESS",
        DEFAULT_REGISTRY_BY_NETWORK[network] ?? "",
      ),
    },
    merchant: {
      pilotId: envString("VITE_W3SPAY_PILOT_MERCHANT_ID", "funkhaus"),
      registryRetryBudgetMs: 120_000,
      registryRetryIntervalMs: 5_000,
    },
    chain: {
      network,
      readOnlyOrigin: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    },
    token: {
      symbol: "CASH TOKEN",
      plancksPerCent: 10 ** (decimals - displayDecimals),
    },
    payment: {
      devStartingBalancePlancks: 10_000_000_000,
    },
    host: {
      productDotNs: requireEnvString("VITE_DOTNS_PRODUCT_DOMAIN"),
      productDerivationIndex: 0,
      pollIntervalMs: 50,
      waitTimeoutMs: 3_000,
      standaloneWaitTimeoutMs: 250,
    },
    storage: {
      receiptsKey: "w3spay:receipts:v1",
      receiptsMaxEntries: 100,
      receiptsSchemaVersion: 2,
    },
    features: {
      tipScreen: false,
      devPaymentOverride: envFlag("VITE_W3SPAY_DEV_PAYMENT_OVERRIDE", true),
      supportedPlatforms: parseSupportedPlatforms(
        envString("VITE_SUPPORTED_PLATFORMS", "mobile,desktop,desktop-app,dotli"),
      ),
    },
    telemetry: {
      // KILL SWITCH. Flip to `false` to ship telemetry disabled (tracker
      // degrades to console-only; no Sentry network calls or handlers).
      enabled: envFlag("VITE_W3SPAY_SENTRY_ENABLED", false),
      dsn: envString("VITE_W3SPAY_SENTRY_DSN", ""),
      environment: envString(
        "VITE_W3SPAY_SENTRY_ENV",
        (import.meta.env.MODE as string | undefined) ?? "development",
      ),
      tracesSampleRate: Number(
        envString("VITE_W3SPAY_SENTRY_TRACES_SAMPLE_RATE", "1.0"),
      ),
    },
    debug: {
      enabled: envFlag("VITE_W3SPAY_DEBUG_PANEL", false),
      // Default `true` while hunting the iOS host boot-regression — a
      // session-startup log is our only signal when the host wedges.
      openByDefault: envFlag("VITE_W3SPAY_DEBUG_PANEL_OPEN", false),
      defaultTab: "console",
    },
  };
}


export const envConfig: EnvConfig = readEnv();
