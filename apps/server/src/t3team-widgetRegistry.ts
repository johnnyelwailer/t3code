/**
 * In-memory registry of ad-hoc widgets published via `t3team.widget.show`. The tool-call
 * bridge route resolves a widget's persisted capability allowlist (and owning thread) here
 * before dispatching through the tool broker. Entries live for the server process lifetime;
 * after a restart widget tool calls fail closed with a clear "widget session expired" error
 * (the widget itself keeps rendering — its HTML travels on the message attachment).
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface T3TeamWidgetRegistration {
  readonly widgetId: string;
  readonly threadId: string;
  /** Broker tool ids the widget bridge may call. Empty = no tool access. */
  readonly tools: ReadonlyArray<string>;
}

export interface T3TeamWidgetRegistryShape {
  readonly put: (registration: T3TeamWidgetRegistration) => Effect.Effect<void>;
  readonly get: (widgetId: string) => Effect.Effect<T3TeamWidgetRegistration | undefined>;
}

export class T3TeamWidgetRegistry extends Context.Service<
  T3TeamWidgetRegistry,
  T3TeamWidgetRegistryShape
>()("t3/t3team-widgetRegistry/T3TeamWidgetRegistry") {}

const MAX_REGISTRATIONS = 500;
const MAX_REGISTRATIONS_PER_THREAD = 50;

export function createT3TeamWidgetRegistry(): T3TeamWidgetRegistryShape {
  const registrations = new Map<string, T3TeamWidgetRegistration>();
  return {
    put: (registration) =>
      Effect.sync(() => {
        // Bounded globally AND per thread: evict the oldest entries (Map preserves insertion
        // order) so neither a long-lived server nor a single chatty thread grows unbounded.
        const sameThread = [...registrations.values()].filter(
          (entry) => entry.threadId === registration.threadId,
        );
        for (let index = 0; index <= sameThread.length - MAX_REGISTRATIONS_PER_THREAD; index += 1) {
          registrations.delete(sameThread[index]!.widgetId);
        }
        while (registrations.size >= MAX_REGISTRATIONS) {
          const oldest = registrations.keys().next().value;
          if (oldest === undefined) break;
          registrations.delete(oldest);
        }
        registrations.set(registration.widgetId, registration);
      }),
    get: (widgetId) => Effect.sync(() => registrations.get(widgetId)),
  };
}

export const T3TeamWidgetRegistryLive = Layer.sync(T3TeamWidgetRegistry, () =>
  T3TeamWidgetRegistry.of(createT3TeamWidgetRegistry()),
);
