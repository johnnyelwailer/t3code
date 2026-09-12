/**
 * Project source-icon reactor (t3team).
 *
 * Runs the Jira avatar ingest (t3team-projectSourceIconIngest.ts) OUTSIDE
 * the orchestration command-decide path: the engine's command queue must
 * stay free of network I/O, so when a project gains or re-points an
 * atlassian source binding this reactor downloads the avatar on its own
 * worker and dispatches a follow-up `project.meta.update` carrying the
 * stored `faviconPath` — a normal dispatch; it omits `source`, so it
 * cannot re-trigger this reactor.
 *
 * Triggers: `project.created` / `project.meta-updated` events carrying an
 * atlassian source, plus an initial startup sync for source-bound projects
 * without an icon. Re-ingest happens only when the binding moved to a
 * different Jira project than the stored icon came from; a user-chosen
 * icon on the unchanged binding is never touched. Gated by
 * `t3teamProjectSourceIconIngestEnabled` (on by default, fail-open).
 */
import { CommandId, type OrchestrationEvent } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  type AtlassianBinding,
  ingestFlagEnabled,
  ingestProjectSourceIcon,
  isAtlassianBinding,
} from "./t3team-projectSourceIconIngest.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

type SourceIconCandidate = { readonly projectId: string; readonly source: AtlassianBinding };

const candidateFromEvent = (event: OrchestrationEvent): SourceIconCandidate | undefined => {
  if (event.type !== "project.created" && event.type !== "project.meta-updated") return undefined;
  const source = event.payload.source;
  if (!isAtlassianBinding(source)) return undefined;
  return { projectId: event.payload.projectId, source };
};

export interface T3TeamProjectSourceIconReactorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  /** Resolves when the internal queue is idle. Intended for tests. */
  readonly drain: Effect.Effect<void>;
}

export class T3TeamProjectSourceIconReactor extends Context.Service<
  T3TeamProjectSourceIconReactor,
  T3TeamProjectSourceIconReactorShape
>()("t3/t3team-projectSourceIconReactor/T3TeamProjectSourceIconReactor") {}

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  // projectId -> external Jira project id the stored favicon came from
  // (empty after a restart; then icon-bearing projects are left untouched).
  const ingestedFrom = new Map<string, string>();

  const processCandidate = (candidate: SourceIconCandidate): Effect.Effect<void, never, never> =>
    Effect.gen(function* () {
      if (!(yield* ingestFlagEnabled())) return;
      const snapshotOption = yield* projectionSnapshotQuery.getShellSnapshot().pipe(Effect.option);
      if (Option.isNone(snapshotOption)) return;
      const snapshot = snapshotOption.value;
      const project = snapshot.projects.find((item) => item.id === candidate.projectId);
      if (project === undefined || !isAtlassianBinding(project.source)) return;
      // The binding already moved past this candidate; a newer event handles it.
      if (project.source.externalProjectId !== candidate.source.externalProjectId) return;
      const hasIcon =
        (project.faviconPath ?? null) !== null || (project.projectIcon ?? null) !== null;
      const ingestedFromId = ingestedFrom.get(project.id);
      if (
        hasIcon &&
        !(ingestedFromId !== undefined && ingestedFromId !== project.source.externalProjectId)
      ) {
        return;
      }
      const faviconPath = yield* ingestProjectSourceIcon({
        projectId: project.id,
        source: project.source,
      });
      if (faviconPath === null) return;
      ingestedFrom.set(project.id, project.source.externalProjectId);
      yield* orchestrationEngine
        .dispatch({
          type: "project.meta.update",
          commandId: CommandId.make(t3teamRandomUUID()),
          projectId: project.id,
          faviconPath,
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logDebug("project source icon follow-up dispatch failed", {
              projectId: project.id,
              cause: Cause.pretty(cause),
            }),
          ),
        );
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? // Best-effort: let the in-flight item finish; the next take stops with the scope.
            Effect.void
          : Effect.logDebug("project source icon sync skipped", {
              projectId: candidate.projectId,
              cause: Cause.pretty(cause),
            }),
      ),
    );

  const worker = yield* makeDrainableWorker(processCandidate);

  const start = Effect.fn("T3TeamProjectSourceIconReactor.start")(function* () {
    // Initial sync: source-bound projects without an icon — enqueue only.
    yield* projectionSnapshotQuery.getShellSnapshot().pipe(
      Effect.flatMap((snapshot) =>
        Effect.forEach(snapshot.projects, (project) => {
          if (!isAtlassianBinding(project.source)) return Effect.void;
          if ((project.faviconPath ?? null) !== null || (project.projectIcon ?? null) !== null) {
            return Effect.void;
          }
          return worker.enqueue({ projectId: project.id, source: project.source });
        }),
      ),
      Effect.catchCause((cause) =>
        Effect.logDebug("project source icon initial sync skipped", {
          cause: Cause.pretty(cause),
        }),
      ),
    );
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        const candidate = candidateFromEvent(event);
        return candidate === undefined ? Effect.void : worker.enqueue(candidate);
      }),
    );
  });

  return { start, drain: worker.drain } satisfies T3TeamProjectSourceIconReactorShape;
});

export const T3TeamProjectSourceIconReactorLive = Layer.effect(
  T3TeamProjectSourceIconReactor,
  make,
);
