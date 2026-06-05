// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Sentry bootstrap. MUST be imported FIRST in `main.tsx` — before React and
 * any other product module — so the SDK's global error handlers wire up before
 * anything can throw.
 *
 * When `telemetry.enabled` is false it short-circuits (no `Sentry.init`).
 * Otherwise `initTelemetry` pins `sendDefaultPii: false` and omits
 * `browserTracingIntegration` so the SDK doesn't auto-instrument fetch/xhr/
 * navigation, which would leak the registry contract address + Bulletin gateway.
 */

import { initTelemetry, sentryRemoteOrigins } from "@/telemetry";
import { requestRemoteOriginPermission } from "@/shared/api/host/connection.ts";

import { envConfig } from "@/config";

const { telemetry } = envConfig;

if (telemetry.enabled) {
  initTelemetry({
    dsn: telemetry.dsn,
    app: "w3spay",
    environment: telemetry.environment,
    tracesSampleRate: telemetry.tracesSampleRate,
  });
  // In a Polkadot host the sandbox blocks outbound HTTP to non-allowlisted
  // origins, so Sentry's ingest is unreachable and events silently never ship.
  // Request Remote(origin) permission on the DSN host. No-op outside a host or
  // in console-only mode. Fire-and-forget: never throws, grant persists.
  void requestRemoteOriginPermission(sentryRemoteOrigins(telemetry.dsn));
} else {
  // Kill switch on — keep the `[Journey:*]` console waterfall but never load
  // the SDK's global handlers. Logged once so a deploy can confirm.
  console.info("[w3spay/telemetry] disabled via config.telemetry.enabled");
}
