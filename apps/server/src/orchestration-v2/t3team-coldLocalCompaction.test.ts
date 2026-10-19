import { assert, it } from "@effect/vitest";
import { describe, expect, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";

import * as ContextHandoffService from "./ContextHandoffService.ts";
import { ProjectionStoreReadError } from "./ProjectionStore.ts";
import {
  ColdLocalCompaction,
  ColdLocalCompactionError,
  tryColdLocalCompaction,
  type ColdLocalCompactionRequest,
  type ColdLocalCompactionShape,
} from "./t3team-coldLocalCompaction.ts";
import {
  COLD_NOW,
  COLD_REPORTED_AT,
  WARM_REPORTED_AT,
  compactionRun,
  conversationItems,
  nativeThread,
  previousRun,
  projectionWithUsage,
  route,
  threadId,
} from "./t3team-coldLocalCompaction.fixtures.ts";

const layerTest = ContextHandoffService.layer.pipe(Layer.provide(IdAllocator.layer));

const makeCompaction = (
  overrides: Partial<ColdLocalCompactionShape> = {},
): ColdLocalCompactionShape & { readonly summarize: ReturnType<typeof vi.fn> } => ({
  routeFor: () => Effect.succeed(route),
  ...overrides,
  summarize: vi.fn(overrides.summarize ?? (() => Effect.succeed("  Renamed the exporter.  "))),
});

const request = (
  compaction: ColdLocalCompactionShape,
  contextHandoffService: ContextHandoffService.ContextHandoffServiceV2Shape,
  overrides: Partial<ColdLocalCompactionRequest> = {},
): ColdLocalCompactionRequest => ({
  compaction,
  contextHandoffService,
  projection: projectionWithUsage(150_000, COLD_REPORTED_AT),
  run: compactionRun,
  nativeThread,
  loadItems: Effect.succeed(conversationItems),
  now: DateTime.makeUnsafe(COLD_NOW),
  ...overrides,
});

describe("tryColdLocalCompaction", () => {
  it.layer(layerTest)("with the real handoff service", (it) => {
    it.effect("summarizes a cold thread into a handoff for the next turn", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction();

        const handoff = yield* tryColdLocalCompaction(request(compaction, service));

        assert.isDefined(handoff);
        assert.strictEqual(handoff?.strategy, "full_thread_summary");
        assert.strictEqual(handoff?.status, "ready");
        assert.strictEqual(handoff?.summaryText, "Renamed the exporter.");
        assert.isUndefined(handoff?.history);
        assert.strictEqual(handoff?.targetRunId, compactionRun.id);
        assert.strictEqual(handoff?.toProviderThreadId, nativeThread.id);
        assert.strictEqual(handoff?.createdByProviderInstanceId, "nexplore");
        expect(compaction.summarize).toHaveBeenCalledOnce();
        expect(compaction.summarize.mock.calls[0]?.[0]).toMatchObject({ route });
        expect(compaction.summarize.mock.calls[0]?.[0].transcript).toContain("Rename the exporter");
      }),
    );

    it.effect("leaves a warm thread to the native compaction", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction();
        const warm = projectionWithUsage(150_000, WARM_REPORTED_AT);

        const handoff = yield* tryColdLocalCompaction(
          request(compaction, service, { projection: warm }),
        );

        assert.isUndefined(handoff);
        expect(compaction.summarize).not.toHaveBeenCalled();
      }),
    );

    it.effect("leaves the thread native when no route applies", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction({ routeFor: () => Effect.succeed(undefined) });

        assert.isUndefined(yield* tryColdLocalCompaction(request(compaction, service)));
        expect(compaction.summarize).not.toHaveBeenCalled();
      }),
    );

    it.effect("is a no-op with the default reference, which registers no route", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = yield* ColdLocalCompaction;

        assert.isUndefined(yield* tryColdLocalCompaction(request(compaction, service)));
      }),
    );

    it.effect("stays native while another run is active or without a native thread", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction();
        const busy = projectionWithUsage(150_000, COLD_REPORTED_AT, [
          { ...previousRun, status: "running" },
          compactionRun,
        ]);

        assert.isUndefined(
          yield* tryColdLocalCompaction(request(compaction, service, { projection: busy })),
        );
        assert.isUndefined(
          yield* tryColdLocalCompaction(request(compaction, service, { nativeThread: undefined })),
        );
        expect(compaction.summarize).not.toHaveBeenCalled();
      }),
    );

    it.effect("falls back to native when the local summary fails or is empty", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const failing = makeCompaction({
          summarize: () => Effect.fail(new ColdLocalCompactionError({ reason: "gateway down" })),
        });
        const empty = makeCompaction({ summarize: () => Effect.succeed("   ") });

        assert.isUndefined(yield* tryColdLocalCompaction(request(failing, service)));
        assert.isUndefined(yield* tryColdLocalCompaction(request(empty, service)));
      }),
    );
    it.effect("falls back to native when preparing the handoff throws", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction();
        const throwing = {
          ...service,
          prepareProviderHandoff: () => Effect.die("history cannot be rendered"),
        };

        assert.isUndefined(yield* tryColdLocalCompaction(request(compaction, throwing)));
        expect(compaction.summarize).not.toHaveBeenCalled();
      }),
    );

    it.effect("falls back to native when the thread history cannot be read", () =>
      Effect.gen(function* () {
        const service = yield* ContextHandoffService.ContextHandoffServiceV2;
        const compaction = makeCompaction();

        const handoff = yield* tryColdLocalCompaction(
          request(compaction, service, {
            loadItems: Effect.fail(
              new ProjectionStoreReadError({ threadId, cause: "database unavailable" }),
            ),
          }),
        );

        assert.isUndefined(handoff);
        expect(compaction.summarize).not.toHaveBeenCalled();
      }),
    );
  });
});
