// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Router assembly — route tree + hash-history router. Hash history (not browser
 * history) is deliberate: w3spay ships with a relative Vite base (`base: "./"`)
 * to IPFS / Bulletin, served from an arbitrary gateway subpath. Path history
 * would desync with that base on reload / deep-link; hash routing is
 * self-contained and reload-safe inside the host webview.
 */

import {
  createHashHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import { devPayRoutes, paymentRoutes, scanRoute } from "@/features/payment/routes.tsx";
import { rootRoute } from "@/app/router/root.tsx";
import { walletRoutes } from "@/features/wallet/routes.tsx";

const routeTree = rootRoute.addChildren([
  scanRoute,
  ...paymentRoutes,
  ...devPayRoutes,
  ...walletRoutes,
]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  // No data preloading — every screen's data comes from the shared host
  // queries / session store, not route loaders.
  defaultPreload: false,
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}
