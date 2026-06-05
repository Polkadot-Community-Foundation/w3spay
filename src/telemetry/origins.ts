// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Origin derivation for the telemetry transport — kept free of any
 * `@sentry/react` import so it stays trivially testable and can be used by the
 * host-permission bootstrap before React mounts.
 */

/**
 * Origins the telemetry transport needs the host to allowlist, derived from
 * the Sentry DSN.
 *
 * In a sandboxed Polkadot host, outbound HTTP is blocked per-origin until the
 * host grants a `Remote` permission. The DSN host is the ONLY origin this
 * transport talks to — replay is disabled and tracePropagationTargets is []
 * (see initTelemetry) — so it is the complete allowlist required.
 *
 * Returns the bare hostname (no scheme, no path — the shape the host-API
 * `Remote` codec expects). Returns [] when the DSN is empty or unparseable:
 * that is console-only mode (Sentry runs with enabled: false), so there is no
 * network and nothing to allowlist.
 */
export function sentryRemoteOrigins(dsn: string): string[] {
  const trimmed = dsn.trim();
  if (trimmed === "") return [];
  try {
    return [new URL(trimmed).hostname];
  } catch {
    return [];
  }
}
