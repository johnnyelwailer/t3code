import type { T3TeamViewContext } from "@t3tools/contracts";

export const VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS = 400;

/**
 * One thread's publication channel: updates are debounced, a context equal to the last one sent is
 * dropped, and `dispose` clears the thread's entry on the server if anything was sent.
 */
export function createViewContextPublisher(input: {
  readonly publish: (viewContext: T3TeamViewContext | null) => Promise<unknown>;
  readonly debounceMs?: number;
}) {
  const debounceMs = input.debounceMs ?? VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS;
  let lastSent: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const update = (context: T3TeamViewContext | null) => {
    clearTimeout(timer);
    if (context === null) return;
    const serialized = JSON.stringify(context);
    if (serialized === lastSent) return;
    timer = setTimeout(() => {
      lastSent = serialized;
      input.publish(context).catch(() => {
        lastSent = null;
      });
    }, debounceMs);
  };

  const dispose = () => {
    clearTimeout(timer);
    if (lastSent === null) return;
    lastSent = null;
    input.publish(null).catch(() => undefined);
  };

  return { update, dispose };
}
