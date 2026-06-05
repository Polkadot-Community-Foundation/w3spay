// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Loads the merchant table once at boot as a TanStack Query.
 *
 * On chain failure with no cached snapshot the query throws and retries
 * every `registryRetryIntervalMs` for `registryRetryBudgetMs`; on success
 * the table is cached forever (`staleTime: Infinity`). After the budget
 * expires with no data, `useMerchantTable` returns `failed: true` and the
 * StaleMerchantsBanner surfaces. A KvStore snapshot that already satisfies
 * the chain's registry version resolves immediately from cache.
 *
 * Reads run under the mapped read-only sentinel: host product accounts are
 * not guaranteed mapped in pallet-revive and view calls then fail with
 * `Revive.AccountUnmapped`.
 */

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";


import type { MerchantTable } from "@/features/merchants/types.ts";
import {
  loadMerchants,
  type LoadMerchantsSource,
} from "@/features/merchants/lib/load-merchants.ts";
import { useAssetHubClient } from "@/features/host/lib/client.ts";
import { getTerminalStore } from "@/features/host/lib/terminal-store.ts";
import { merchantKeys } from "@/features/merchants/api/keys.ts";
import { envConfig } from "@/config";

export interface MerchantTableState {
  readonly table: MerchantTable | null;
  readonly source: LoadMerchantsSource | null;
  /** True once all retry attempts are exhausted with no data. */
  readonly failed: boolean;
}

/**
 * Registry dry-run origin: the known mapped read-only sentinel. Reads are
 * public, so a host product account would only add a pallet-revive mapping
 * requirement.
 */
export function merchantDryRunOrigin(readOnlyOrigin: string): string {
  return readOnlyOrigin;
}

interface LoadedMerchants {
  readonly table: MerchantTable;
  readonly source: LoadMerchantsSource;
}

/**
 * Shared query options for the merchant directory at a dry-run `origin`.
 * The scan flow's `ensureQueryData` awaits this same cache entry instead
 * of issuing a second read.
 */
export function merchantTableQueryOptions(origin: string) {
  const { merchant, contracts } = envConfig;
  const registryAddress = contracts.merchantRegistryAddress;
  const retryCount = Math.ceil(merchant.registryRetryBudgetMs / merchant.registryRetryIntervalMs);
  return queryOptions({
    queryKey: merchantKeys.table(origin),
    queryFn: async (): Promise<LoadedMerchants> => {
      // useAssetHubClient is a cached singleton getter, not a React hook
      // (see `host/client.ts`); safe to call here.
      const client = useAssetHubClient().client;
      console.log("[w3spay/merchants] loading merchant table", { origin, registryAddress });
      try {
        const result = await loadMerchants({
          registryAddress,
          client,
          origin,
          store: getTerminalStore(),
          onWarn: (message, error) =>
            console.warn(`[w3spay/merchants] ${message}`, error),
        });
        console.info("[w3spay/merchants] table loaded", {
          count: Object.keys(result.table).length,
          source: result.source,
          registryVersion: result.registryVersion?.toString(),
          origin,
        });
        console.info(result.table);
        // Registry configured but chain + cache both empty → throw so
        // TanStack retries. Dev/standalone returns empty as terminal success.
        if (result.source === "empty" && registryAddress.length > 0) {
          throw new Error("[w3spay/merchants] registry unreachable; will retry");
        }
        return { table: result.table, source: result.source };
      } catch (caught) {
        // Re-throw so TanStack's retry loop handles it.
        if (caught instanceof Error && caught.message.startsWith("[w3spay/merchants]")) {
          throw caught;
        }
        console.error("[w3spay/merchants] could not resolve any merchant table", caught);
        throw caught;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: (count) => count < retryCount,
    retryDelay: merchant.registryRetryIntervalMs,
  });
}

export function useMerchantTable(): MerchantTableState {
  const origin = merchantDryRunOrigin(envConfig.chain.readOnlyOrigin);

  const query = useQuery({
    ...merchantTableQueryOptions(origin),
    placeholderData: keepPreviousData,
  });

  if (query.isError && query.data == null) {
    return { table: {}, source: "empty", failed: true };
  }
  return { ...query.data ?? { table: null, source: null }, failed: false };
}
