import {
  type ApplicationStoredEvent,
  type OrchestrationProjectShell,
  ProjectId,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as NodeOS from "node:os";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { ProjectionProjectSourceBindingRepositoryLive } from "./persistence/Layers/t3team-ProjectionProjectSourceBindings.ts";
import { OrchestrationEventStore } from "./persistence/Services/OrchestrationEventStore.ts";
import { ProjectionProjectSourceBindingRepository } from "./persistence/Services/t3team-ProjectionProjectSourceBindings.ts";
import { ProjectService } from "./project/ProjectService.ts";
import * as ServerSettings from "./serverSettings.ts";
import {
  type AvatarProvider,
  setIngestProjectSourceIconTestProvider,
} from "./t3team-projectSourceIconIngest.ts";
import {
  T3TeamProjectSourceIconReactor,
  T3TeamProjectSourceIconReactorLive,
} from "./t3team-projectSourceIconReactor.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const stateDir = `${NodeOS.tmpdir()}/psicon-reactor-${t3teamRandomUUID()}`;
const atlassianSource = (externalProjectId: string) => ({
  provider: "atlassian" as const,
  accountId: "account-1",
  externalProjectId,
});
const fakeProvider: AvatarProvider = {
  listProjects: async () => [
    { id: "11816", iconUrl: "https://example.atlassian.net/avatar/1" },
    { id: "10008", iconUrl: "https://example.atlassian.net/avatar/2" },
  ],
  downloadAsset: async () => ({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    mimeType: "image/png",
  }),
};

type ProjectRow = {
  readonly id: string;
  readonly source?: OrchestrationProjectShell["source"];
  readonly faviconPath?: string | null;
};

const toShell = (project: ProjectRow): OrchestrationProjectShell =>
  ({
    id: ProjectId.make(project.id),
    title: "Example",
    workspaceRoot: "/tmp/example",
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-12T12:00:00.000Z",
    ...(project.faviconPath !== undefined ? { faviconPath: project.faviconPath } : {}),
    ...(project.source !== undefined ? { source: project.source } : {}),
  }) as OrchestrationProjectShell;

const projectEvent = (
  type: "project.created" | "project.meta-updated" | "project.deleted",
  projectId: string,
) =>
  ({
    type,
    aggregateKind: "project",
    aggregateId: ProjectId.make(projectId),
    sequence: 2,
  }) as unknown as ApplicationStoredEvent;

const makeTestLayer = (input: {
  readonly events: ReadonlyArray<ApplicationStoredEvent>;
  readonly projects: () => ReadonlyArray<ProjectRow>;
  readonly updates: Array<{ readonly projectId: string; readonly faviconPath?: string | null }>;
  readonly onUpdate?: () => void;
  readonly flagEnabled: boolean;
}) =>
  Layer.mergeAll(
    T3TeamProjectSourceIconReactorLive,
    ProjectionProjectSourceBindingRepositoryLive,
  ).pipe(
    Layer.provideMerge(
      Layer.mock(ProjectService)({
        getShell: (projectId) =>
          Effect.sync(() =>
            Option.fromUndefinedOr(input.projects().find((project) => project.id === projectId)),
          ).pipe(Effect.map(Option.map(toShell))),
        listShells: () => Effect.sync(() => input.projects().map(toShell)),
        update: (update) =>
          Effect.sync(() => {
            input.updates.push({
              projectId: update.projectId,
              ...(update.faviconPath === undefined ? {} : { faviconPath: update.faviconPath }),
            });
            input.onUpdate?.();
            return {} as never;
          }),
      }),
    ),
    Layer.provideMerge(
      Layer.mock(OrchestrationEventStore)({
        latestApplicationSequence: Effect.succeed(1),
        streamApplicationEvents: () => Stream.fromIterable(input.events),
      }),
    ),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(Layer.succeed(ServerConfig.ServerConfig, { stateDir } as never)),
    Layer.provideMerge(
      Layer.succeed(ServerSettings.ServerSettingsService, {
        getSettings: Effect.succeed({
          t3teamProjectSourceIconIngestEnabled: input.flagEnabled,
        } as never),
      } as never),
    ),
  );

/** Advance the frozen test clock so forked stream/worker fibers get turns; `drain` then awaits I/O. */
const flush = () =>
  Effect.gen(function* () {
    yield* TestClock.adjust("10 millis");
    yield* TestClock.adjust("10 millis");
    yield* TestClock.adjust("10 millis");
  });

const runReactor = Effect.gen(function* () {
  setIngestProjectSourceIconTestProvider(fakeProvider);
  const reactor = yield* T3TeamProjectSourceIconReactor;
  yield* reactor.start();
  yield* flush();
  yield* reactor.drain;
});

describe("T3TeamProjectSourceIconReactor", () => {
  it.layer(NodeServices.layer)("project source icon reactor", (it) => {
    it.effect("initial sync writes the stored faviconPath for an icon-less bound project", () => {
      const updates: Array<{ projectId: string; faviconPath?: string | null }> = [];
      const projects: ProjectRow[] = [
        { id: "project-live-a", source: atlassianSource("11816") },
        { id: "project-live-b", source: atlassianSource("11816"), faviconPath: "/existing.png" },
        { id: "project-live-c", source: { provider: "local" } },
      ];
      return Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        yield* runReactor;
        assert.deepStrictEqual(updates, [
          {
            projectId: "project-live-a",
            faviconPath: `${stateDir}/project-icons/project-live-a.png`,
          },
        ]);
        const bytes = yield* fileSystem.readFile(`${stateDir}/project-icons/project-live-a.png`);
        assert.deepStrictEqual(Array.from(bytes.slice(0, 4)), [137, 80, 78, 71]);
      }).pipe(
        Effect.provide(
          makeTestLayer({ events: [], projects: () => projects, updates, flagEnabled: true }),
        ),
      );
    });

    it.effect("writes nothing when the flag is disabled", () => {
      const updates: Array<{ projectId: string }> = [];
      const projects: ProjectRow[] = [{ id: "project-flag-off", source: atlassianSource("11816") }];
      return runReactor.pipe(
        Effect.andThen(Effect.sync(() => assert.strictEqual(updates.length, 0))),
        Effect.provide(
          makeTestLayer({ events: [], projects: () => projects, updates, flagEnabled: false }),
        ),
      );
    });

    it.effect("re-ingests when a project event shows the binding re-pointed", () => {
      const updates: Array<{ projectId: string }> = [];
      // When the initial follow-up lands, the binding already moved to another Jira project.
      let projects: ProjectRow[] = [{ id: "project-rebind", source: atlassianSource("11816") }];
      return runReactor.pipe(
        Effect.andThen(Effect.sync(() => assert.strictEqual(updates.length, 2))),
        Effect.provide(
          makeTestLayer({
            events: [projectEvent("project.meta-updated", "project-rebind")],
            projects: () => projects,
            updates,
            onUpdate: () => {
              projects = [
                {
                  id: "project-rebind",
                  source: atlassianSource("10008"),
                  faviconPath: "/stored.png",
                },
              ];
            },
            flagEnabled: true,
          }),
        ),
      );
    });

    it.effect("keeps an ingested icon while the binding stays on the same project", () => {
      const updates: Array<{ projectId: string }> = [];
      let projects: ProjectRow[] = [{ id: "project-same", source: atlassianSource("11816") }];
      return runReactor.pipe(
        Effect.andThen(Effect.sync(() => assert.strictEqual(updates.length, 1))),
        Effect.provide(
          makeTestLayer({
            events: [projectEvent("project.meta-updated", "project-same")],
            projects: () => projects,
            updates,
            onUpdate: () => {
              projects = [
                { id: "project-same", source: atlassianSource("11816"), faviconPath: "/x.png" },
              ];
            },
            flagEnabled: true,
          }),
        ),
      );
    });

    it.effect("project.deleted and startup sweep remove bindings of gone projects", () => {
      const updates: Array<{ projectId: string }> = [];
      // project-gone is unknown at startup (swept); project-deleted is deleted by an event.
      const projects: ProjectRow[] = [
        { id: "project-kept", source: { provider: "local" } },
        { id: "project-deleted", source: { provider: "local" } },
      ];
      return Effect.gen(function* () {
        const bindings = yield* ProjectionProjectSourceBindingRepository;
        for (const id of ["project-kept", "project-gone", "project-deleted"]) {
          yield* bindings.upsert({
            projectId: ProjectId.make(id),
            source: { provider: "local" },
            updatedAt: "2026-09-12T12:00:00.000Z",
          });
        }
        yield* runReactor;
        const left = (yield* bindings.listAll()).map((row) => row.projectId);
        assert.deepStrictEqual(left, ["project-kept"]);
      }).pipe(
        Effect.provide(
          makeTestLayer({
            events: [projectEvent("project.deleted", "project-deleted")],
            projects: () => projects,
            updates,
            flagEnabled: true,
          }),
        ),
      );
    });
  });
});
