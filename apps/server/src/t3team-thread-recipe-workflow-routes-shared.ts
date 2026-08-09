import {
  type OrchestrationCommand,
  type ProviderInteractionMode,
  type RuntimeMode,
  type SourceControlProviderKind,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { T3TeamAtlassianError } from "./t3team-atlassian-http.ts";
import type { T3TeamWorkflowHostToolScope } from "./t3team-recipeWorkflowToolScope.ts";
import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";

export function isRuntimeMode(value: string): value is RuntimeMode {
  return value === "approval-required" || value === "auto-accept-edits" || value === "full-access";
}

export function isProviderInteractionMode(value: string): value is ProviderInteractionMode {
  return value === "default" || value === "plan";
}

export const loadThreadProjectContext = Effect.fn("loadThreadProjectContext")(function* (
  threadId: ThreadId,
) {
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const thread = yield* projectionSnapshotQuery
    .getThreadDetailById(threadId)
    .pipe(Effect.map((threadOption) => (threadOption._tag === "Some" ? threadOption.value : null)));
  if (!thread) {
    return yield* new T3TeamAtlassianError({ message: "Thread not found." });
  }

  const project = yield* projectionSnapshotQuery
    .getProjectShellById(thread.projectId)
    .pipe(
      Effect.map((projectOption) => (projectOption._tag === "Some" ? projectOption.value : null)),
    );
  if (!project) {
    return yield* new T3TeamAtlassianError({ message: "Project not found." });
  }

  return { project, thread };
});

/**
 * Builds the `resolveSourceControlProviderKind` closure `resolveHostToolBridge` forwards to
 * `draftChangeRequestReview` — Effect-context work (acquiring the optional registry service)
 * done ONCE per launch, collapsed to a plain `Effect<(() => Promise<Kind>) | undefined>` so the
 * route itself stays a single `yield*`. `cwd` is the project's workspace root, the same
 * single-repo-per-project cwd the tool broker itself resolves a provider against elsewhere
 * (`t3team-toolBrokerStartChildContext.ts`) — never a hardcoded `"github"`. No registry available
 * (a deployment that never wires source control, same as the tool broker's own optional use of it
 * in `t3team-toolBrokerLive.ts`) ⇒ `undefined`, and the eventual draft falls back to `"unknown"`.
 */
export const buildSourceControlProviderKindResolver = Effect.fn(
  "buildSourceControlProviderKindResolver",
)(function* (cwd: string) {
  const sourceControlProviderRegistry = Option.getOrUndefined(
    yield* Effect.serviceOption(SourceControlProviderRegistry),
  );
  if (sourceControlProviderRegistry === undefined) return undefined;
  return (): Promise<SourceControlProviderKind> =>
    Effect.runPromise(
      sourceControlProviderRegistry.resolve({ cwd }).pipe(
        Effect.map((provider) => provider.kind),
        Effect.orElseSucceed(() => "unknown" as const),
      ),
    );
});

/**
 * Resolves the launch's host-tool bridge (work-item drafts + the change-request review draft
 * tool) from an already-resolved recipe scope. Split out of the launch route
 * (`t3team-thread-recipe-workflow-routes.ts`) to keep that file under its LOC ceiling — the
 * reasoning for WHY scope gates this bridge lives there and with
 * `makeT3TeamWorkflowHostDraftToolClient` itself, not duplicated here.
 */
export function resolveHostToolBridge(input: {
  readonly toolBroker: T3TeamToolBrokerShape;
  readonly launchThreadId: string;
  readonly hostToolScope: T3TeamWorkflowHostToolScope;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  /** Forwarded verbatim to `makeT3TeamWorkflowHostDraftToolClient` — resolves the
   * `SourceControlProviderKind` for the repository this launch is bound to, so the
   * change-request review draft's `target.provider` is a real provider rather than an assumed
   * one. The launch route builds this from `SourceControlProviderRegistry.resolve` against the
   * project's workspace root; callers with no such context (or no registry available) can leave
   * it undefined and the bridge falls back to `"unknown"` rather than guessing. */
  readonly resolveSourceControlProviderKind?:
    | (() => Promise<SourceControlProviderKind>)
    | undefined;
}) {
  const { toolBroker, launchThreadId, hostToolScope, dispatch, resolveSourceControlProviderKind } =
    input;
  if (hostToolScope.kind !== "granted") {
    return { hostToolClient: undefined, hostToolGrant: undefined };
  }
  return {
    hostToolGrant: { toolGroups: hostToolScope.toolGroups },
    hostToolClient: makeT3TeamWorkflowHostDraftToolClient({
      broker: toolBroker,
      launchThreadId,
      allowedToolGroups: hostToolScope.toolGroups,
      dispatch,
      resolveSourceControlProviderKind,
    }),
  };
}
