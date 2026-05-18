# W3SPay

Outside-venue Coinage receipt scanner for Web3 Summit Berlin (18–19 June 2026).

A Triangle (Polkadot host) sandboxed SPA. Scans a German fiscal TSE QR code
(BSI TR-03151 / KassenSichV §6) from any merchant's printed receipt, extracts
`(kassenSerial, amountEur)`, looks up the merchant's smart-contract destination
in a hardcoded table, and issues an RFC 6 Coinage payment via the host
`coinPayment.paymentRequest` capability. Shows a confirmation screen the
customer hands to the cashier.

Forked from `repos/t3rminal/apps/merchant-terminal/`. Same Vite +
`product-sdk-pack` + `bulletin-deploy → .dot` shell; new UI + parser layer.

## Develop

```sh
npm install
npm run dev
```

## Test

```sh
npm test
```

## Build

```sh
npm run build
```

## Deploy as `w3spay.dot`

```sh
export DOTNS_MNEMONIC="your twelve word mnemonic phrase here"
./deploy.sh
```

See `deploy.sh` for optional overrides.
# W3SPay
