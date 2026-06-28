import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { t3workRandomUUID } from "./t3work-random.ts";

export type T3workContextSyncRequest = {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly ticketKey: string;
  readonly createdAt: string;
};

export type T3workContextSyncQueueShape = {
  readonly enqueue: (
    input: Omit<T3workContextSyncRequest, "id" | "createdAt">,
  ) => Effect.Effect<T3workContextSyncRequest, never>;
  readonly listPendingForThread: (
    threadId: ThreadId,
  ) => Effect.Effect<ReadonlyArray<T3workContextSyncRequest>, never>;
  readonly complete: (input: {
    readonly requestId: string;
    readonly threadId: ThreadId;
  }) => Effect.Effect<boolean, never>;
};

export class T3workContextSyncQueue extends Context.Service<
  T3workContextSyncQueue,
  T3workContextSyncQueueShape
>()("t3/t3work-contextSyncQueue/T3workContextSyncQueue") {}

const createT3workContextSyncQueue = Effect.fn("createT3workContextSyncQueue")(function* () {
  const pendingByThread = new Map<ThreadId, T3workContextSyncRequest[]>();

  const enqueue: T3workContextSyncQueueShape["enqueue"] = (input) =>
    Effect.sync(() => {
      const request: T3workContextSyncRequest = {
        id: t3workRandomUUID(),
        createdAt: new Date().toISOString(),
        ...input,
      };
      const existing = pendingByThread.get(input.threadId) ?? [];
      const next = existing.filter(
        (entry) => entry.ticketKey.toLowerCase() !== input.ticketKey.toLowerCase(),
      );
      pendingByThread.set(input.threadId, [...next, request]);
      return request;
    });

  const listPendingForThread: T3workContextSyncQueueShape["listPendingForThread"] = (threadId) =>
    Effect.sync(() => pendingByThread.get(threadId) ?? []);

  const complete: T3workContextSyncQueueShape["complete"] = ({ requestId, threadId }) =>
    Effect.sync(() => {
      const existing = pendingByThread.get(threadId);
      if (!existing) {
        return false;
      }
      const next = existing.filter((entry) => entry.id !== requestId);
      if (next.length === existing.length) {
        return false;
      }
      if (next.length === 0) {
        pendingByThread.delete(threadId);
      } else {
        pendingByThread.set(threadId, next);
      }
      return true;
    });

  return { enqueue, listPendingForThread, complete } satisfies T3workContextSyncQueueShape;
});

export const T3workContextSyncQueueLive = Layer.effect(
  T3workContextSyncQueue,
  createT3workContextSyncQueue(),
);
