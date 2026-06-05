// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/** App root — assembles the provider tree, the router, and the in-page debug overlay. */

import { DebugPanel } from "@/shared/api/host/debug";

import { Providers } from "@/app/providers.tsx";
import { AppRouter } from "@/app/router/index.tsx";
import { envConfig } from "@/config";

export function App() {
  return (
    <Providers>
      <AppRouter />
      {envConfig.debug.enabled ? (
        <DebugPanel defaultOpen={envConfig.debug.openByDefault} initialFilter="" />
      ) : null}
    </Providers>
  );
}
