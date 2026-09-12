import {
  ProjectId,
  type OrchestrationEvent,
  type OrchestrationShellSnapshot,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as NodeOS from "node:os";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerConfig from "./config.ts";
import * as ServerSettings from "./serverSettings.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
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
  readonly source?: {
    readonly provider: string;
    readonly accountId?: string;
    readonly externalProjectId?: string;
  };
  readonly faviconPath?: string | null;
};

const shellSnapshot = (projects: ProjectRow[]): OrchestrationShellSnapshot =>
  ({
    snapshotSequence: 1,
    updatedAt: "2026-09-12T12:00:00.000Z",
    threads: [],
    projects: projects.map((project) => ({
      id: ProjectId.make(project.id),
      title: "Nexi AI",
      workspaceRoot: "/tmp/nexi-ai",
      scripts: [],
      createdAt: "2026-09-12T12:00:00.000Z",
      updatedAt: "2026-09-12T12:00:00.000Z",
      ...(project.faviconPath !== undefined ? { faviconPath: project.faviconPath } : {}),
      ...(project.source !== undefined ? { source: project.source } : {}),
    })),
  }) as unknown as OrchestrationShellSnapshot;

// Superset payload of `project.created` / `project.meta-updated`; the reactor
// only reads `payload.projectId` and `payload.source`.
const projectEvent = (
  type: "project.created" | "project.meta-updated",
  projectId: string,
  externalProjectId: string,
) =>
  ({
    type,
    payload: {
      projectId: ProjectId.make(projectId),
      title: "Nexi AI",
      workspaceRoot: "/tmp/nexi-ai",
      scripts: [],
      updatedAt: "2026-09-12T12:00:00.000Z",
      source: atlassianSource(externalProjectId),
    },
  }) as unknown as OrchestrationEvent;

const makeTestLayer = (
  engine: OrchestrationEngineShape,
  getSnapshot: () => OrchestrationShellSnapshot,
  flagEnabled: boolean,
) =>
  T3TeamProjectSourceIconReactorLive.pipe(
    Layer.provideMerge(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getShellSnapshot: () => Effect.succeed(getSnapshot()),
      } as never),
    ),
    Layer.provideMerge(Layer.succeed(ServerConfig.ServerConfig, { stateDir } as never)),
    Layer.provideMerge(
      Layer.succeed(ServerSettings.ServerSettingsService, {
        getSettings: Effect.succeed({ t3teamProjectSourceIconIngestEnabled: flagEnabled } as never),
      } as never),
    ),
  );

const makeEngine = (
  events: ReadonlyArray<OrchestrationEvent>,
  dispatches: unknown[],
  onDispatch?: () => void,
) =>
  ({
    streamDomainEvents: Stream.make(...events),
    dispatch: (command: unknown) => {
      dispatches.push(command);
      onDispatch?.();
      return Effect.succeed({ sequence: 1 });
    },
  }) as unknown as OrchestrationEngineShape;

/** Advance the frozen test clock so forked stream/worker fibers get event-loop
 *  turns to enqueue and start processing; the real file I/O is then awaited by
 *  the subsequent `drain`. */
const flush = () =>
  Effect.gen(function* () {
    yield* TestClock.adjust("10 millis");
    yield* TestClock.adjust("10 millis");
    yield* TestClock.adjust("10 millis");
  });

describe("T3TeamProjectSourceIconReactor", () => {
  it.layer(NodeServices.layer)("project source icon reactor", (it) => {
    it.effect("initial sync dispatches a follow-up meta.update with the stored faviconPath", () => {
      const dispatches: unknown[] = [];
      const engine = makeEngine([], dispatches);
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const fileSystem = yield* FileSystem.FileSystem;
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 1);
        const command = dispatches[0] as {
          type: string;
          projectId: string;
          faviconPath?: string;
          source?: unknown;
        };
        assert.strictEqual(command.type, "project.meta.update");
        assert.strictEqual(command.projectId, "project-live-a");
        assert.strictEqual(command.faviconPath, `${stateDir}/project-icons/project-live-a.png`);
        assert.strictEqual(command.source, undefined);
        const bytes = yield* fileSystem.readFile(`${stateDir}/project-icons/project-live-a.png`);
        assert.deepStrictEqual(Array.from(bytes.slice(0, 4)), [137, 80, 78, 71]);
      }).pipe(
        Effect.provide(
          makeTestLayer(
            engine,
            () =>
              shellSnapshot([
                { id: "project-live-a", source: atlassianSource("11816") },
                {
                  id: "project-live-b",
                  source: atlassianSource("11816"),
                  faviconPath: "/existing/icon.png",
                },
                {
                  id: "project-live-c",
                  source: { provider: "local", accountId: "x", externalProjectId: "y" },
                },
              ]),
            true,
          ),
        ),
      );
    });

    it.effect("dispatches nothing when the flag is disabled", () => {
      const dispatches: unknown[] = [];
      const engine = makeEngine([], dispatches);
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 0);
      }).pipe(
        Effect.provide(
          makeTestLayer(
            engine,
            () => shellSnapshot([{ id: "project-flag-off", source: atlassianSource("11816") }]),
            false,
          ),
        ),
      );
    });

    it.effect("ingests live when a project.created event carries an atlassian source", () => {
      const dispatches: unknown[] = [];
      // The follow-up landing is mirrored into the snapshot so the duplicate
      // candidate (initial sync + created event) sees the stored icon and skips.
      let projects: ProjectRow[] = [{ id: "project-created", source: atlassianSource("11816") }];
      const engine = makeEngine(
        [projectEvent("project.created", "project-created", "11816")],
        dispatches,
        () => {
          projects = [
            {
              id: "project-created",
              source: atlassianSource("11816"),
              faviconPath: `${stateDir}/project-icons/project-created.png`,
            },
          ];
        },
      );
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 1);
        const command = dispatches[0] as { readonly type: string; readonly projectId: string };
        assert.strictEqual(command.type, "project.meta.update");
        assert.strictEqual(command.projectId, "project-created");
      }).pipe(Effect.provide(makeTestLayer(engine, () => shellSnapshot(projects), true)));
    });

    it.effect("re-ingests when the binding re-points at a different Jira project", () => {
      const dispatches: unknown[] = [];
      // When the initial follow-up lands, the binding has already moved to the
      // new Jira project (what a real rebind looks like to the worker).
      let projects: ProjectRow[] = [{ id: "project-rebind", source: atlassianSource("11816") }];
      const engine = makeEngine(
        [projectEvent("project.meta-updated", "project-rebind", "10008")],
        dispatches,
        () => {
          projects = [{ id: "project-rebind", source: atlassianSource("10008") }];
        },
      );
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 2);
      }).pipe(Effect.provide(makeTestLayer(engine, () => shellSnapshot(projects), true)));
    });

    it.effect("keeps an already-ingested icon when the binding stays on the same project", () => {
      const dispatches: unknown[] = [];
      let projects: ProjectRow[] = [{ id: "project-same", source: atlassianSource("11816") }];
      const engine = makeEngine(
        [projectEvent("project.meta-updated", "project-same", "11816")],
        dispatches,
        () => {
          projects = [
            {
              id: "project-same",
              source: atlassianSource("11816"),
              faviconPath: `${stateDir}/project-icons/project-same.png`,
            },
          ];
        },
      );
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 1);
      }).pipe(Effect.provide(makeTestLayer(engine, () => shellSnapshot(projects), true)));
    });

    it.effect("dispatches nothing when the bound project has no avatar", () => {
      const dispatches: unknown[] = [];
      const engine = makeEngine([], dispatches);
      return Effect.gen(function* () {
        setIngestProjectSourceIconTestProvider(fakeProvider);
        const reactor = yield* T3TeamProjectSourceIconReactor;
        yield* reactor.start();
        yield* flush();
        yield* reactor.drain;
        assert.strictEqual(dispatches.length, 0);
      }).pipe(
        Effect.provide(
          makeTestLayer(
            engine,
            () => shellSnapshot([{ id: "project-missing", source: atlassianSource("no-such-id") }]),
            true,
          ),
        ),
      );
    });
  });
});
