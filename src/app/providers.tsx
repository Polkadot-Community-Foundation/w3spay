// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Top-level provider composition. Currently just `<QueryClientProvider>`; the
 * router has its own `<RouterProvider>` and Zustand stores are providerless
 * module singletons, so neither appears here.
 */

import type { ReactNode } from "react";

import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/shared/api/query-client.ts";

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
