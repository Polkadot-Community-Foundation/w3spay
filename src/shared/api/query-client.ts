// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * TanStack Query client singleton, shared via `<QueryClientProvider>`.
 * Refetch on focus/reconnect is off — a backgrounded mobile webview
 * regaining focus must NOT re-poll the chain; mutations invalidate
 * explicitly, so `staleTime` is generous. Query keys live in each
 * feature's `api/keys.ts` to keep reads coupled to their invalidations.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});
