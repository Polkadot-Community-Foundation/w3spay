#!/usr/bin/env bash
#
# deploy.sh - Build and deploy the W3SPay SPA as a .dot product.
#
# Usage:
#   ./deploy.sh [name-or-domain]
#
# The product domain must come from either the first CLI argument or the
# VITE_DOTNS_PRODUCT_DOMAIN env var — no default.
#
# Required env:
#   - MNEMONIC or DOTNS_MNEMONIC
#   - VITE_DOTNS_PRODUCT_DOMAIN   Product DOTNS identifier to publish (REQUIRED, no default).
#                             Used for the polkadot-app-deploy target and rewritten
#                             into the published manifest `[app] id`. Also passed to
#                             the build so the SPA knows its own product identity.
#
# Optional env:
#   - DOTNS_GATEWAY_BASE      Final gateway host suffix (default: dot.li). On
#                             summit the gateway is https://summit-ipfs.polkadot.io.
#   - BULLETIN_ENV            polkadot-app-deploy --env id (default: paseo-next-v2;
#                             `summit` for the Summit network). VITE_NETWORK must
#                             match it. Coinage (CASH/pUSD) lives on the people
#                             chain of the chosen env — paseo-next-v2 and summit
#                             both have one; do not point at an env that lacks it.
#   - VITE_NETWORK            App chain key. Defaults to BULLETIN_ENV and MUST
#                             match it for deployment.
#
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/dist"
GATEWAY_BASE="${DOTNS_GATEWAY_BASE:-dot.li}"
BULLETIN_ENV="${BULLETIN_ENV:-paseo-next-v2}"
# Resolved in two phases like TARGET below: shell env here, .env fallback after
# _read_envfile_key is defined. Left empty for now so the fallback can tell an
# unset var from an explicit value; the false default is applied post-fallback.
BULLETIN_DEPLOY_PUBLISH="${BULLETIN_DEPLOY_PUBLISH:-}"
# TARGET is resolved in two phases: shell sources (CLI arg or env) here at
# the top, then .env files in the block that follows the _read_envfile_key
# helper definition. Splitting them avoids calling the helper before it's
# been declared.
TARGET="${1:-${VITE_DOTNS_PRODUCT_DOMAIN:-}}"

# .dot suffix is appended after the Phase 2 .env fallback, below.

# Resolve the deploy CLI. Prefer a globally-installed `polkadot-app-deploy`
# (CI installs it once); otherwise fall back to npx with the version pinned.
# The scoped PCF package ships the BUILT-IN `summit` env (all Summit RPCs +
# DotNS addresses + the `https://summit-ipfs.polkadot.io` gateway) and the
# manifest direct-signer fix. The legacy unscoped `bulletin-deploy` is NOT
# used: its repo is gone and it lacks the manifest fix.
PAD_PKG="@polkadot-community-foundation/polkadot-app-deploy@0.10.1"
if command -v polkadot-app-deploy >/dev/null 2>&1; then
  PAD=(polkadot-app-deploy)
elif command -v pad >/dev/null 2>&1; then
  PAD=(pad)
else
  PAD=(npx -y "$PAD_PKG")
fi

# Resolve the deploying mnemonic. Sources in priority order:
#   1. Shell env vars (MNEMONIC or DOTNS_MNEMONIC) — highest priority
#   2. .env files in Vite precedence order:
#        .env.production.local → .env.production → .env.local → .env
#      Recognises both the MNEMONIC= and DOTNS_MNEMONIC= keys.
# Both variable names are accepted at every layer; they MUST agree when
# both are set in the same source. Store the mnemonic in .env.local
# (gitignored) rather than .env to avoid accidental commits.

# Helper: read and normalise a single key from an env file.
# Prints the value on stdout; returns 1 when the key is absent or empty.
# Strips one layer of surrounding quotes and collapses internal whitespace —
# same rules as Vite's dotenv loader.
_read_envfile_key() {
  local file="$1" key="$2" line value
  line="$( (grep -E "^${key}=" "$file" || true) | tail -n 1)"
  [[ -n "$line" ]] || return 1
  value="${line#"${key}="}"
  value="${value#"${value%%[![:space:]]*}"}"   # ltrim
  value="${value%"${value##*[![:space:]]}"}"   # rtrim
  if [[ "$value" == \"*\" ]]; then value="${value#\"}"; value="${value%\"}"; fi
  if [[ "$value" == \'*\' ]]; then value="${value#\'}"; value="${value%\'}"; fi
  value="$(printf '%s' "$value" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"
  [[ -n "$value" ]] && printf '%s' "$value" || return 1
}

# 1. Normalise shell env vars and check for conflicts.
_dotns_norm="$(printf '%s' "${DOTNS_MNEMONIC:-}" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"
_mnem_norm="$(printf '%s' "${MNEMONIC:-}" | tr -s '[:space:]' ' ' | sed -E 's/^ //; s/ $//')"

if [[ -n "$_dotns_norm" && -n "$_mnem_norm" && "$_dotns_norm" != "$_mnem_norm" ]]; then
  echo "Error: DOTNS_MNEMONIC and MNEMONIC are both set but contain different values."
  echo ""
  echo "This is almost always a stale export. Unset the one you do not want, then re-run:"
  echo "  unset DOTNS_MNEMONIC   # to use the MNEMONIC you just exported"
  echo "  unset MNEMONIC         # to use DOTNS_MNEMONIC instead"
  exit 1
fi

RAW_MNEMONIC="${_dotns_norm:-$_mnem_norm}"

# 2. Fall back to .env files when neither shell var is set.
if [[ -z "$RAW_MNEMONIC" ]]; then
  for _envfile in .env.production.local .env.production .env.local .env; do
    [[ -f "$SCRIPT_DIR/$_envfile" ]] || continue
    _f_dotns="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" DOTNS_MNEMONIC || true)"
    _f_mnem="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" MNEMONIC || true)"
    if [[ -n "$_f_dotns" && -n "$_f_mnem" && "$_f_dotns" != "$_f_mnem" ]]; then
      echo "Error: $_envfile sets both DOTNS_MNEMONIC and MNEMONIC to different values."
      echo "Remove one of them from $_envfile."
      exit 1
    fi
    RAW_MNEMONIC="${_f_dotns:-$_f_mnem}"
    if [[ -n "$RAW_MNEMONIC" ]]; then
      echo "==> Using mnemonic from ${_envfile}."
      break
    fi
  done
fi

# Phase 2 of TARGET resolution: fall back to .env files in Vite precedence
# order when neither CLI nor shell env supplied the domain. Done here so
# _read_envfile_key is already defined. A single .env entry drives both
# this script and the downstream Vite build.
if [[ -z "$TARGET" ]]; then
  for _envfile in .env.production.local .env.production .env.local .env; do
    [[ -f "$SCRIPT_DIR/$_envfile" ]] || continue
    _resolved="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" VITE_DOTNS_PRODUCT_DOMAIN || true)"
    if [[ -n "$_resolved" ]]; then
      TARGET="$_resolved"
      echo "==> Using product domain from ${_envfile}."
      break
    fi
  done
fi
if [[ -z "$TARGET" ]]; then
  echo "Error: product domain is required."
  echo ""
  echo "Provide it via one of:"
  echo "  export VITE_DOTNS_PRODUCT_DOMAIN=myinstance.dot"
  echo "  ./deploy.sh myinstance.dot"
  echo "  VITE_DOTNS_PRODUCT_DOMAIN=myinstance.dot in .env / .env.local"
  exit 1
fi
if [[ "$TARGET" != *.dot ]]; then
  TARGET="${TARGET}.dot"
fi

# Phase 2 of BULLETIN_DEPLOY_PUBLISH resolution: fall back to .env files in
# Vite precedence order when the shell env didn't set it, then default to
# false. Mirrors the MNEMONIC/TARGET .env fallbacks above so a single .env
# entry drives the publish decision without an extra shell export.
if [[ -z "$BULLETIN_DEPLOY_PUBLISH" ]]; then
  for _envfile in .env.production.local .env.production .env.local .env; do
    [[ -f "$SCRIPT_DIR/$_envfile" ]] || continue
    _resolved="$(_read_envfile_key "$SCRIPT_DIR/$_envfile" BULLETIN_DEPLOY_PUBLISH || true)"
    if [[ -n "$_resolved" ]]; then
      BULLETIN_DEPLOY_PUBLISH="$_resolved"
      echo "==> Using publish flag from ${_envfile} (BULLETIN_DEPLOY_PUBLISH=${BULLETIN_DEPLOY_PUBLISH})."
      break
    fi
  done
fi
BULLETIN_DEPLOY_PUBLISH="${BULLETIN_DEPLOY_PUBLISH:-false}"

if [[ -z "$RAW_MNEMONIC" ]]; then
  echo "Error: no mnemonic found. Provide one via:"
  echo ""
  echo "  export MNEMONIC=\"your twelve word mnemonic phrase here\""
  echo ""
  echo "  or add MNEMONIC=... to .env.local (gitignored — never commit it)."
  exit 1
fi

# Word-count sanity check: BIP-39 mnemonics are 12 or 24 words. Anything else
# is a paste accident — fail fast with a helpful message instead of letting
# `@polkadot/keyring` throw the opaque "Unable to match provided value to a
# secret URI" later.
WORD_COUNT="$(printf '%s' "$RAW_MNEMONIC" | awk '{print NF}')"
if [[ "$WORD_COUNT" != "12" && "$WORD_COUNT" != "24" ]]; then
  echo "Error: mnemonic has $WORD_COUNT words; expected 12 or 24."
  echo ""
  echo "Re-check the value you exported. The mnemonic must be the exact"
  echo "12- or 24-word phrase your wallet shows, separated by single spaces."
  exit 1
fi

export MNEMONIC="$RAW_MNEMONIC"
export VITE_NETWORK="${VITE_NETWORK:-${BULLETIN_ENV:-paseo-next-v2}}"
export VITE_DOTNS_PRODUCT_DOMAIN="$TARGET"


case "$VITE_NETWORK" in
  paseo|paseo-next-v2|previewnet|summit) ;;
  *)
    echo "Error: VITE_NETWORK=\"$VITE_NETWORK\" is not supported."
    echo "Expected one of: paseo, paseo-next-v2, previewnet, summit."
    exit 1
    ;;
esac
if [[ "$VITE_NETWORK" != "$BULLETIN_ENV" ]]; then
  echo "Error: VITE_NETWORK=\"$VITE_NETWORK\" must match BULLETIN_ENV=\"$BULLETIN_ENV\" for deployment."
  echo "Set both to the same network before deploying."
  exit 1
fi

echo "==> Using network: ${VITE_NETWORK}"
echo "==> Building W3SPay SPA..."
npm --prefix "$SCRIPT_DIR" run build
echo "==> Copying dot.li manifest (id=${TARGET})..."
cp "$SCRIPT_DIR/bundle/manifest.toml" "$BUILD_DIR/manifest.toml"
if [[ ! -f "$BUILD_DIR/manifest.toml" ]]; then
  echo "Error: manifest.toml was not copied into the build output."
  exit 1
fi
# Stamp the resolved product domain into [app] id. `awk` is used instead of
# `sed -i` because BSD sed (macOS) doesn't support GNU's `0,/RE/` range and
# rejects empty replacement patterns; the manifest lives in a fresh build
# copy, so this never touches the source manifest in bundle/.
awk -v id="$TARGET" '
  /^\[app\]$/ { inapp=1; print; next }
  /^\[/      { inapp=0; print; next }
  inapp && /^id = "/ { sub(/^id = ".*"/, "id = \"" id "\"") }
  { print }
' "$BUILD_DIR/manifest.toml" > "$BUILD_DIR/manifest.toml.tmp" \
  && mv "$BUILD_DIR/manifest.toml.tmp" "$BUILD_DIR/manifest.toml"

# Resolve the --publish flag. The Publisher (Browse directory) registry only
# exists on paseo-next-v2 — Summit has no Publisher, so --publish is a non-op
# there (a non-fatal skip). Never pass it on summit.
PUBLISH_FLAG=()
if [[ "$BULLETIN_DEPLOY_PUBLISH" == "true" ]]; then
  if [[ "$BULLETIN_ENV" == "summit" ]]; then
    echo "==> Note: --publish requested but ignored on summit (no Publisher registry)."
  else
    PUBLISH_FLAG=(--publish)
  fi
fi

echo ""
echo "==> Deploying ${TARGET} via ${PAD[*]} (BULLETIN_ENV=${BULLETIN_ENV})..."
# --config        : product manifest is auto-discovered by filename, but pass it
#                   explicitly so a future build-dir change can't silently drop it.
# --mnemonic      : routes Bulletin storage signing to DIRECT mode (the signer is
#                   both DotNS owner and upload signer). Without it, uploads ride
#                   the default public pool — unauthorized on Summit.
# --js-merkle     : pure-JS merkleization; skips the Kubo download.
# --no-transfer-to-signedin-user : don't hand a fresh registration to a stale
#                   signed-in identity on the runner/VM.
"${PAD[@]}" \
  "${PUBLISH_FLAG[@]}" \
  --env "$BULLETIN_ENV" \
  --mnemonic "$RAW_MNEMONIC" \
  --config "$SCRIPT_DIR/polkadot-app-deploy.config.ts" \
  --js-merkle \
  --no-transfer-to-signedin-user \
  "$BUILD_DIR" "$TARGET"

NAME="${TARGET%.dot}"
echo ""
echo "==> Done! Live at:"
echo "    https://${NAME}.${GATEWAY_BASE}"
