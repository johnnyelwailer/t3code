import { assert, it } from "@effect/vitest";
import { ThreadId, type OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import { readDigestHandoffTickets, readDigestThreads } from "./t3team-myworkDigestQueries.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

const shell = (id: string, projectId: string, model = "gpt-5.1-codex") =>
  ({
    id: ThreadId.make(id),
    projectId,
    title: `Thread ${id}`,
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model },
    updatedAt: DateTime.makeUnsafe("2026-10-01T10:00:00.000Z"),
  }) as unknown as OrchestrationV2ThreadShell;

const Mocks = Layer.mergeAll(
  Layer.mock(ThreadManagementService)({
    getShellSnapshot: () =>
      Effect.succeed({
        schemaVersion: 1,
        snapshotSequence: 1,
        threads: [shell("t1", "p1"), shell("t2", "p1"), shell("t3", "p2"), shell("t4", "p9")],
        archivedThreads: [shell("archived", "p1")],
      }),
  }),
  Layer.mock(T3TeamThreadFactsStore)({
    list: () =>
      Effect.succeed([
        { threadId: ThreadId.make("t2"), retention: "ephemeral" },
        { threadId: ThreadId.make("t1"), retention: null },
      ] as never),
  }),
  Layer.mock(T3TeamChildThreadMetadata)({
    listByChildThreadIds: (ids) =>
      Effect.succeed(
        [
          {
            childThreadId: "t1",
            parentThreadId: "p",
            placementThreadId: null,
            ticketId: " ENG-1 ",
          },
          { childThreadId: "t3", parentThreadId: "p", placementThreadId: null, ticketId: null },
        ].filter((row) => ids.includes(row.childThreadId)) as never,
      ),
  }),
);

it.effect("claim candidates: active threads of the projects, ephemeral helpers excluded", () =>
  Effect.gen(function* () {
    const rows = yield* readDigestThreads(["p1", "p2"]);
    assert.deepStrictEqual(rows, [
      {
        threadId: "t1",
        projectId: "p1",
        title: "Thread t1",
        updatedAt: "2026-10-01T10:00:00.000Z",
        agent: "Codex · gpt-5.1-codex",
      },
      {
        threadId: "t3",
        projectId: "p2",
        title: "Thread t3",
        updatedAt: "2026-10-01T10:00:00.000Z",
        agent: "Codex · gpt-5.1-codex",
      },
    ]);
    assert.deepStrictEqual(yield* readDigestThreads([]), []);
  }).pipe(Effect.provide(Mocks)),
);

it.effect("ticket fallback reads the delegated-child metadata (trimmed, empty skipped)", () =>
  Effect.gen(function* () {
    const tickets = yield* readDigestHandoffTickets(["t1", "t3"]);
    assert.deepStrictEqual([...tickets], [["t1", "ENG-1"]]);
  }).pipe(Effect.provide(Mocks)),
);
