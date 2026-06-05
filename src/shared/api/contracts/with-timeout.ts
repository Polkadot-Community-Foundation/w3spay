// SPDX-License-Identifier: GPL-3.0-or-later
// @paritytech

/**
 * Race a promise against a wall-clock timeout — bounds hung host RPC,
 * signer, or runtime calls. `label` is woven into the timeout error to
 * identify the stalled request; the timer is always cleared.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
