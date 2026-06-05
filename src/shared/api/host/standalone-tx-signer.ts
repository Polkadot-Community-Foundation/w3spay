// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * PolkadotSigner for standalone browser-extension mode. Uses PAPI's
 * `getPolkadotSigner` to assemble the signing payload (sidesteps PAPI's PJS
 * adapter that throws on unknown signed-extensions like Polkadot Hub TestNet's
 * `AsPgas`) and delegates byte signing to the extension via
 * `signRaw({ type: "payload" })`. Unused by the host-only w3spay products;
 * kept for any future extension-only mode.
 */
import { fromHex, toHex } from "@polkadot-api/utils";
import { getPolkadotSigner } from "polkadot-api/signer";
import type { PolkadotSigner } from "polkadot-api/signer";

type SigningType = "Sr25519" | "Ed25519" | "Ecdsa";

const SCHEME_BY_KEYPAIR: Record<string, SigningType> = {
  sr25519: "Sr25519",
  ed25519: "Ed25519",
  ecdsa: "Ecdsa",
};

interface InjectedSigner {
  signRaw: (req: {
    address: string;
    data: string;
    type: "bytes" | "payload";
  }) => Promise<{ signature: string }>;
}

interface InjectedEntry {
  enable: (origin: string) => Promise<{ signer: InjectedSigner }>;
}

export interface CreateStandaloneTxSignerOpts {
  /** `injectedWeb3` key, e.g. `talisman` or `polkadot-js`. */
  extensionName: string;
  /** Dapp origin string used when enabling the extension. */
  dappName: string;
  address: string;
  publicKey: Uint8Array;
  /**
   * Keypair scheme as reported by the extension. Determines the
   * MultiSignature prefix byte. Defaults to sr25519.
   */
  keypairType?: string;
}

export function createStandaloneTxSigner(
  opts: CreateStandaloneTxSignerOpts,
): PolkadotSigner {
  const {
    extensionName,
    dappName,
    address,
    publicKey,
    keypairType = "sr25519",
  } = opts;
  const scheme = SCHEME_BY_KEYPAIR[keypairType.toLowerCase()] ?? "Sr25519";

  const sign = async (data: Uint8Array): Promise<Uint8Array> => {
    const entry = (
      globalThis as { injectedWeb3?: Record<string, InjectedEntry> }
    ).injectedWeb3?.[extensionName];
    if (!entry) throw new Error(`Extension "${extensionName}" not available`);
    const ext = await entry.enable(dappName);
    const result = await ext.signer.signRaw({
      address,
      data: toHex(data),
      type: "payload",
    });
    const sigBytes = fromHex(result.signature);
    // 64 bytes = raw sig (we must prepend the scheme byte); 65 bytes
    // = wallet pre-prefixed the MultiSignature variant. Default assumes raw.
    return sigBytes;
  };

  return getPolkadotSigner(publicKey, scheme, sign);
}
