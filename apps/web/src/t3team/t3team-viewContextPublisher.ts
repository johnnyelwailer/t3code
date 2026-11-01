import type { T3TeamViewContext } from "@t3tools/contracts";

export const VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS = 400;

const NOTHING_PUBLISHED = "null";

/**
 * One thread's publication channel. Updates are debounced and a context equal to what the server
 * holds is dropped; `null` clears the server's entry (once something was sent). Requests run one
 * after another and carry an increasing sequence, so none can overtake a newer one or a clear.
 * `dispose` flushes a clear if the server holds anything.
 */
export function createViewContextPublisher(input: {
  readonly publish: (viewContext: T3TeamViewContext | null, sequence: number) => Promise<unknown>;
  readonly debounceMs?: number;
}) {
  const debounceMs = input.debounceMs ?? VIEW_CONTEXT_PUBLISH_DEBOUNCE_MS;
  let held: string | undefined = NOTHING_PUBLISHED;
  let sequence = 0;
  let chain: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const send = (context: T3TeamViewContext | null, serialized: string) => {
    held = serialized;
    sequence = Math.max(sequence + 1, Date.now());
    const seq = sequence;
    chain = chain.then(() =>
      input.publish(context, seq).catch(() => {
        held = undefined;
      }),
    );
  };

  const update = (context: T3TeamViewContext | null) => {
    clearTimeout(timer);
    const serialized = JSON.stringify(context);
    if (serialized === held) return;
    timer = setTimeout(() => send(context, serialized), debounceMs);
  };

  const dispose = () => {
    clearTimeout(timer);
    if (held !== NOTHING_PUBLISHED) send(null, NOTHING_PUBLISHED);
  };

  return { update, dispose };
}
