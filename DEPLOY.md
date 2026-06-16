# Deploy

Builds the SPA and publishes it as a `.dot` product via
`@polkadot-community-foundation/polkadot-app-deploy` (the `summit` env is
built in).

## Guided deploy (`npm run setup`)

```bash
npm install
cp .env.example .env.local   # optional — the wizard prompts for anything missing
npm run setup
```

`npm run setup` is an interactive wizard that runs the whole pipeline from a
single repo-root `.env.local`: **environment** (Node ≥ 22) → **configure**
(network, domain, optional registry override, publisher mnemonic, and whether to
list the app in the Browse directory — written back to `.env.local`) →
**readiness** (Asset Hub RPC reachable) → **build & publish** (`deploy.sh` →
`polkadot-app-deploy`). Re-running reuses the saved choices.

| Flag | Effect |
| --- | --- |
| `--network <key>` (`--env <key>`) | `paseo` \| `paseo-next-v2` \| `previewnet` \| `summit`. |
| `--domain <name[.dot]>` | Target domain; `.dot` is appended if missing. |
| `--publish` / `--no-publish` | List (or not) the `.dot` in the on-chain Publisher registry — the Browse directory (`paseo-next-v2` only; **ignored on `summit`** — no Publisher). Default: the saved/`.env` value, else off. |
| `--yes` (`-y`, `--non-interactive`) | No prompts. Every required value must come from `.env.local`/flags. |
| `--dry-run` | Run environment + configure + readiness checks only. Writes nothing. |

Non-interactive (CI / VM):

```bash
npm run setup -- --network summit --domain w3spaycheckout.dot --yes
```

On `summit` the publisher mnemonic must be the Bulletin-authorized uploader that
owns the target `.dot`; it signs both the Bulletin upload and the DotNS bind.

## Prerequisites

- Node ≥ 22
- The deploy CLI `@polkadot-community-foundation/polkadot-app-deploy@0.11.0` —
  installed globally by CI, otherwise fetched on demand by `deploy.sh` via
  `npx` (no repo dependency).

## Configure

```bash
cp .env.example .env.local
```

Set in `.env.local` (gitignored — never commit a mnemonic):

| Variable | Required | Notes |
| --- | --- | --- |
| `MNEMONIC` or `DOTNS_MNEMONIC` | yes | 12- or 24-word publisher phrase. If both set, must match. |
| `VITE_DOTNS_PRODUCT_DOMAIN` | yes | Target domain, e.g. `w3spay.dot`. No default. |
| `VITE_W3SPAY_REGISTRY_ADDRESS` | network-specific | Deployed `W3SPayRegistry` H160. **On `summit` leave blank until the registry is deployed there** (the app then uses its cached snapshot); a paseo address points at a non-existent Summit contract. Defaulted (paseo) in `src/config.ts`. |
| `VITE_NETWORK` | no | One of `paseo` \| `paseo-next-v2` \| `previewnet` \| `summit`. Defaults to `BULLETIN_ENV`. Must match it. |
| `BULLETIN_DEPLOY_PUBLISH` | no | `true` = pass `--publish` (Browse directory; paseo-next-v2 only, ignored on `summit`). Default `false` = upload only. |

## Manual deploy (`npm run deploy`)

```bash
npm run deploy
# or override the domain for one run:
npm run deploy -- mydomain.dot
```

Domain resolution order: CLI arg > shell env > `.env.production.local` > `.env.production` > `.env.local` > `.env`.

The script builds (`tsc` + `vite build`), stamps the resolved domain into
`dist/manifest.toml`, and runs `polkadot-app-deploy --env "$BULLETIN_ENV"`
(default `paseo-next-v2`; set `BULLETIN_ENV=summit` for Summit) with
`--mnemonic`, `--config`, `--js-merkle` and `--no-transfer-to-signedin-user`.

Result: `https://<name>.dot.li` on paseo; on `summit` the gateway is
`https://summit-ipfs.polkadot.io/ipfs/<cid>`.
