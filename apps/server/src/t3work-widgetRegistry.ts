/**
 * In-memory registry of ad-hoc widgets published via `t3work.widget.show`. The tool-call
 * bridge route resolves a widget's persisted capability allowlist (and owning thread) here
 * before dispatching through the tool broker. Entries live for the server process lifetime;
 * after a restart widget tool calls fail closed with a clear "widget session expired" error
 * (the widget itself keeps rendering — its HTML travels on the message attachment).
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface T3workWidgetRegistration {
  readonly widgetId: string;
  readonly threadId: string;
  /** Broker tool ids the widget bridge may call. Empty = no tool access. */
  readonly tools: ReadonlyArray<string>;
}

export interface T3workWidgetRegistryShape {
  readonly put: (registration: T3workWidgetRegistration) => Effect.Effect<void>;
  readonly get: (widgetId: string) => Effect.Effect<T3workWidgetRegistration | undefined>;
}

export class T3workWidgetRegistry extends Context.Service<
  T3workWidgetRegistry,
  T3workWidgetRegistryShape
>()("t3/t3work-widgetRegistry/T3workWidgetRegistry") {}

const MAX_REGISTRATIONS = 500;

export function createT3workWidgetRegistry(): T3workWidgetRegistryShape {
  const registrations = new Map<string, T3workWidgetRegistration>();
  return {
    put: (registration) =>
      Effect.sync(() => {
        // Bounded: evict the oldest entries so a long-lived server cannot grow unbounded.
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

export const T3workWidgetRegistryLive = Layer.sync(T3workWidgetRegistry, () =>
  T3workWidgetRegistry.of(createT3workWidgetRegistry()),
);
