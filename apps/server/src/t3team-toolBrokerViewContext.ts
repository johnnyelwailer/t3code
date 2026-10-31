/**
 * The published view context on the `t3team.view.read` answer (`t3_view_read`). Added only while
 * `AGENTS_VIEW_CONTEXT` is on, read live on every call.
 */
import type { T3TeamStoredViewContext, ThreadId } from "@t3tools/contracts";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { T3TeamThreadToolContextStoreShape } from "./t3team-threadToolContextStore.ts";

export const NO_VIEW_CONTEXT_MESSAGE =
  "No view context published for this thread: it was not opened beside a view that shares one.";

function describeViewContext(stored: T3TeamStoredViewContext | undefined, nowMs: number) {
  if (stored === undefined) {
    return { published: false, message: NO_VIEW_CONTEXT_MESSAGE } as const;
  }
  return {
    published: true,
    publishedAt: DateTime.formatIso(DateTime.makeUnsafe(stored.publishedAtMs)),
    ageSeconds: Math.max(0, Math.round((nowMs - stored.publishedAtMs) / 1000)),
    ...stored.viewContext,
  } as const;
}

export const withPublishedViewContext =
  <A extends object, E, Args extends ReadonlyArray<unknown>>(
    loadView: (threadId: ThreadId, ...rest: Args) => Effect.Effect<A, E>,
    store: Pick<T3TeamThreadToolContextStoreShape, "getViewContext">,
  ) =>
  (threadId: ThreadId, ...rest: Args) =>
    Effect.gen(function* () {
      const view = yield* loadView(threadId, ...rest);
      if (!readFeatureFlag("AGENTS_VIEW_CONTEXT")) return view;
      const stored = yield* store.getViewContext(threadId);
      return { ...view, viewContext: describeViewContext(stored, yield* Clock.currentTimeMillis) };
    });
