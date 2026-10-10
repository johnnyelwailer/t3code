/**
 * Project source-icon reactor (t3team), on the V2 application event log.
 *
 * Runs the Jira avatar ingest (`t3team-projectSourceIconIngest.ts`) outside the
 * project command path: when a project event (`project.created` /
 * `project.meta-updated`) lands for a project whose shell carries an atlassian
 * binding, this reactor downloads the avatar on its own worker and writes the
 * stored `faviconPath` with `ProjectService.update` (no `source`, so the
 * binding hook is not involved). The binding is written before the project
 * event commits (`t3team-projectSourceBindings.ts`), so the shell read here
 * already carries it.
 *
 * Re-ingest happens only when the binding moved to a different Jira project
 * than the stored icon came from; a user-chosen icon on the unchanged binding
 * is never touched. Startup: an initial sync for source-bound projects without
 * an icon, and a sweep of bindings whose project no longer exists.
 * `project.deleted` removes the binding row (deletes from any path: MCP, CLI).
 * Gated by `t3teamProjectSourceIconIngestEnabled` (on by default, fail-open).
 */
import { type ApplicationStoredEvent, CommandId, type ProjectId } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { ProjectionProjectSourceBindingRepositoryLive } from "./persistence/t3team-ProjectionProjectSourceBindings.ts";
import { OrchestrationEventStore } from "./persistence/OrchestrationEventStore.ts";
import { ProjectionProjectSourceBindingRepository } from "./persistence/t3team-ProjectionProjectSourceBindings.ts";
import { ProjectService } from "./project/ProjectService.ts";
import {
  ingestFlagEnabled,
  ingestProjectSourceIcon,
  isAtlassianBinding,
} from "./t3team-projectSourceIconIngest.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

export interface T3TeamProjectSourceIconReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  /** Resolves when the internal queue is idle. Intended for tests. */
  readonly drain: Effect.Effect<void>;
}

export class T3TeamProjectSourceIconReactor extends Context.Service<
  T3TeamProjectSourceIconReactor,
  T3TeamProjectSourceIconReactorShape
>()("t3/t3team-projectSourceIconReactor/T3TeamProjectSourceIconReactor") {}

const logSkipped = (message: string, projectId?: ProjectId) => (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause)
    ? Effect.void
    : Effect.logDebug(message, { projectId, cause: Cause.pretty(cause) });

const make = Effect.gen(function* () {
  const projects = yield* ProjectService;
  const events = yield* OrchestrationEventStore;
  const bindings = yield* ProjectionProjectSourceBindingRepository;
  // projectId -> external Jira project id the stored favicon came from
  // (empty after a restart; then icon-bearing projects are left untouched).
  const ingestedFrom = new Map<ProjectId, string>();

  const processProject = (projectId: ProjectId): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (!(yield* ingestFlagEnabled())) return;
      const shell = yield* projects.getShell(projectId);
      if (Option.isNone(shell) || !isAtlassianBinding(shell.value.source)) return;
      const project = shell.value;
      const source = shell.value.source;
      const hasIcon =
        (project.faviconPath ?? null) !== null || (project.projectIcon ?? null) !== null;
      const ingestedFromId = ingestedFrom.get(projectId);
      const rebound = ingestedFromId !== undefined && ingestedFromId !== source.externalProjectId;
      if (hasIcon && !rebound) return;
      const faviconPath = yield* ingestProjectSourceIcon({ projectId, source });
      if (faviconPath === null) return;
      ingestedFrom.set(projectId, source.externalProjectId);
      yield* projects.update({
        commandId: CommandId.make(`t3team-source-icon:${t3teamRandomUUID()}`),
        projectId,
        faviconPath,
      });
    }).pipe(Effect.catchCause(logSkipped("project source icon sync skipped", projectId)));

  const worker = yield* makeDrainableWorker(processProject);

  const onEvent = (event: ApplicationStoredEvent): Effect.Effect<void> => {
    if (!("aggregateKind" in event) || event.aggregateKind !== "project") return Effect.void;
    if (event.type === "project.deleted") {
      return bindings
        .deleteById({ projectId: event.aggregateId })
        .pipe(Effect.catchCause(logSkipped("project source binding cleanup failed")));
    }
    return worker.enqueue(event.aggregateId);
  };

  const startupSync = Effect.gen(function* () {
    const shells = yield* projects.listShells();
    const active = new Set(shells.map((shell) => shell.id));
    for (const row of yield* bindings.listAll()) {
      if (!active.has(row.projectId)) yield* bindings.deleteById({ projectId: row.projectId });
    }
    for (const shell of shells) {
      const hasIcon = (shell.faviconPath ?? null) !== null || (shell.projectIcon ?? null) !== null;
      if (isAtlassianBinding(shell.source) && !hasIcon) yield* worker.enqueue(shell.id);
    }
  }).pipe(Effect.catchCause(logSkipped("project source icon initial sync skipped")));

  const start = Effect.fn("T3TeamProjectSourceIconReactor.start")(function* () {
    // Live tail from now: the startup sync covers everything before it.
    const afterSequence = yield* events.latestApplicationSequence.pipe(
      Effect.orElseSucceed(() => 0),
    );
    yield* startupSync;
    yield* Effect.forkScoped(
      Stream.runForEach(events.streamApplicationEvents({ afterSequence }), onEvent).pipe(
        Effect.catchCause(logSkipped("project source event stream stopped")),
      ),
    );
  });

  return { start, drain: worker.drain } satisfies T3TeamProjectSourceIconReactorShape;
});

export const T3TeamProjectSourceIconReactorLive = Layer.effect(
  T3TeamProjectSourceIconReactor,
  make,
).pipe(Layer.provide(ProjectionProjectSourceBindingRepositoryLive));
