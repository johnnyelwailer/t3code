import { pinOrderKeyBetween } from "@t3tools/client-runtime/state/thread-sort";

export type PinnedThreadKey = Readonly<{
  readonly pinnedAt: string | null;
  readonly pinOrderKey: string | null;
}>;

/**
 * Order key that pins a thread to the very top of the pinned block. A pin without an order key
 * lands in the keyless group, which the sidebar renders after every keyed pinned thread — so the
 * voice row would never be first. Returns null if existing keys are corrupt; the caller then pins
 * without an order key.
 */
export function topOfPinnedOrderKey(threads: readonly PinnedThreadKey[]): string | null {
  const topKey = threads.reduce<string | null>((top, thread) => {
    if (thread.pinnedAt == null || thread.pinOrderKey == null) return top;
    return top == null || thread.pinOrderKey < top ? thread.pinOrderKey : top;
  }, null);
  return pinOrderKeyBetween(null, topKey);
}
