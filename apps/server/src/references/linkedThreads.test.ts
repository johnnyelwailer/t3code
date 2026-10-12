import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import {
  ProjectId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";

import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { T3TeamChildThreadMetadata } from "../t3team-childThreadMetadata.ts";
import { T3TeamThreadToolContextStore } from "../t3team-threadToolContextStore.ts";
import type { T3TeamTurnToolContext } from "../t3team-toolBroker.ts";

import {
  listReferencePullRequestThreads,
  listReferenceWorkItemThreads,
} from "./linkedThreads.ts";

const shell = (id: string): OrchestrationV2ThreadShell =>
  ({
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-1"),
    title: id,
    archivedAt: null,
  }) as unknown as OrchestrationV2ThreadShell;

const t3teamContext = (ticketId: string): T3TeamTurnToolContext =>
  ({
    surface: "t3team",
    state: { view: { kind: "thread", ticketId } },
  }) as unknown as T3TeamTurnToolContext;

// Project threads: a mix of hot/cold claims, a wrong-ticket claim, a subagent claim, and a
// thread that claims nothing. The roster must return only the threads whose resolved claim is
// the queried ticket, hot winning where the two maps disagree.
const projectThreads = [
  shell("claiming-hot"),
  shell("claiming-cold"),
  shell("hot-wins"),
  shell("other-ticket"),
  shell("subagent"),
  shell("unclaimed"),
];

const hotClaims: Record<string, T3TeamTurnToolContext | undefined> = {
  "claiming-hot": t3teamContext("INT-42"),
  "hot-wins": t3teamContext("INT-42"),
  "other-ticket": t3teamContext("INT-99"),
};

const coldClaims = [
  { childThreadId: "claiming-cold", ticketId: "INT-42" },
  { childThreadId: "hot-wins", ticketId: "INT-99" },
  { childThreadId: "subagent", ticketId: "INT-42" },
];

const fakes = Layer.mergeAll(
  Layer.succeed(
    ThreadManagementService,
    { listProjectThreads: () => Effect.succeed(projectThreads) } as unknown as
      ThreadManagementService["Service"],
  ),
  Layer.succeed(
    T3TeamChildThreadMetadata,
    {
      listByChildThreadIds: (ids: ReadonlyArray<string>) =>
        Effect.succeed(coldClaims.filter((row) => ids.includes(row.childThreadId))),
    } as unknown as T3TeamChildThreadMetadata["Service"],
  ),
  Layer.succeed(
    T3TeamThreadToolContextStore,
    {
      get: (threadId: ThreadId) => Effect.succeed(hotClaims[threadId]),
      put: () => Effect.void,
    } as unknown as T3TeamThreadToolContextStore["Service"],
  ),
);

it.effect("rosters a work item's claiming threads, with the hot claim winning over the cold one", () =>
  Effect.gen(function* () {
    const result = yield* listReferenceWorkItemThreads({
      projectId: ProjectId.make("project-1"),
      ticketId: "INT-42",
    });
    expect(result.threads.map((thread) => thread.id)).toEqual([
      ThreadId.make("claiming-hot"),
      ThreadId.make("claiming-cold"),
      ThreadId.make("hot-wins"),
      ThreadId.make("subagent"),
    ]);
    expect(result.threads.every((thread) => thread.source === "claimed")).toBe(true);
    expect(result.threads.every((thread) => thread.projectId === ProjectId.make("project-1"))).toBe(
      true,
    );
  }).pipe(Effect.provide(fakes)),
);

it.effect("excludes threads whose resolved claim is a different ticket", () =>
  Effect.gen(function* () {
    // `other-ticket` claims INT-99 (hot). `hot-wins` claims INT-42 hot and INT-99 cold, so it
    // resolves to INT-42 and is NOT in this roster.
    const result = yield* listReferenceWorkItemThreads({
      projectId: ProjectId.make("project-1"),
      ticketId: "INT-99",
    });
    expect(result.threads.map((thread) => thread.id)).toEqual([ThreadId.make("other-ticket")]);
  }).pipe(Effect.provide(fakes)),
);

it.effect("tags pull request threads as linked and preserves their archived state", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const createdAt = "2026-09-01T00:00:00.000Z";
    const archivedAt = "2026-09-03T00:00:00.000Z";
    const linked =
      '{"linkedPullRequest":{"projectId":"project-1","repository":"acme/web","number":7,"url":"https://github.com/acme/web/pull/7"}}';
    for (const [id, archived] of [
      ["linked-active", false],
      ["linked-archived", true],
    ] as const) {
      yield* sql`
        INSERT INTO orchestration_v2_projection_threads (
          thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
          created_at, updated_at, archived_at, payload_json
        ) VALUES (
          ${id}, 'project-1', ${id}, 'codex', 'full-access', 'default',
          ${createdAt}, ${archived ? archivedAt : createdAt},
          ${archived ? archivedAt : null}, ${linked}
        )
      `;
    }
    yield* sql`
      INSERT INTO orchestration_v2_projection_threads (
        thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
        created_at, updated_at, payload_json
      ) VALUES (
        'not-linked', 'project-1', 'not-linked', 'codex', 'full-access', 'default',
        ${createdAt}, ${createdAt}, '{}'
      )
    `;
    yield* sql`
      INSERT INTO projection_projects (
        project_id, title, workspace_root, scripts_json, created_at, updated_at
      ) VALUES ('project-1', 'Project', '/tmp/project', '[]', ${createdAt}, ${createdAt})
    `;
    expect(
      yield* listReferencePullRequestThreads({
        host: "github.com",
        repository: "acme/web",
        number: 7,
      }),
    ).toEqual({
      threads: [
        { id: ThreadId.make("linked-archived"), projectId: ProjectId.make("project-1"), title: "linked-archived", archivedAt, source: "linked" },
        { id: ThreadId.make("linked-active"), projectId: ProjectId.make("project-1"), title: "linked-active", archivedAt: null, source: "linked" },
      ],
    });
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
