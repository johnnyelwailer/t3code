/**
 * The `t3team.mywork.*` handlers: resolve the app project's Jira binding(s) the way the web does
 * (`ProjectStoreV2` shells carry the binding), then call the SAME arrangement store the HTTP
 * routes use. How the digest is loaded and the store is run is injected
 * (`t3team-toolBrokerMyWorkLive.ts`), so the handlers hold the rules and nothing else.
 */
import { ProjectId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as SqlClient from "effect/sql/SqlClient";

import type { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { myWorkArrangeMode } from "./t3team-myworkArrangeMode.ts";
import { digestArrangementKey } from "./t3team-myworkDigestArrangement.ts";
import {
  attachDigestArrangementOverlay,
  discardDigestDraft,
  promoteDigestDraft,
  resetDigestArrangement,
  storeDigestDraft,
  storeMyWorkLiveArrangement,
} from "./t3team-myworkDigestArrangementDraft.ts";
import { toDigestInput } from "./t3team-myworkDigestProjectEntries.ts";
import type {
  T3TeamMyWorkDigestInput,
  T3TeamMyWorkDigestPayload,
} from "./t3team-myworkDigestTypes.ts";
import type { T3TeamMyWorkToolHandlers } from "./t3team-toolBrokerBindingMyWork.ts";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The tool stores agent arrangements only: `producer` defaults to 'agent' (any other value is
 * refused, undefined here) and `producedAt` to now. Anything else is the store's validation.
 */
const withAgentDefaults = (plan: unknown, producedAt: string): unknown => {
  if (typeof plan !== "object" || plan === null) return plan;
  const producer = "producer" in plan ? plan.producer : "agent";
  return producer === "agent" ? { producedAt, ...plan, producer } : undefined;
};

export const makeMyWorkHandlers = (input: {
  readonly projects: Pick<ProjectStoreV2["Service"], "listShells">;
  readonly loadDigest: (
    digest: T3TeamMyWorkDigestInput,
  ) => Effect.Effect<T3TeamMyWorkDigestPayload, string>;
  /** The calling thread's app project; how a call without `projectId` finds its project. */
  readonly threadProjectId?: (threadId: string) => Effect.Effect<string, string>;
  /** Run an arrangement-store effect; its failures reach the agent as text. */
  readonly runStore: <A, E>(
    effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  ) => Effect.Effect<A, string>;
  /** Write the maintain recipe into the project's `.t3team/recipes`. Absent = not enabled. */
  readonly writeRecipe?: (
    workspaceRoot: string,
    spec: unknown,
  ) => Effect.Effect<
    { readonly recipeId: string; readonly recipePath: string; readonly workflowPath: string },
    string
  >;
}): T3TeamMyWorkToolHandlers => {
  // No `projectId`: the caller's own project (a recipe launched on a project dashboard arranges
  // that project), else every bound project. A caller outside any project gets the latter.
  const callerProjectId = (projectId: string | undefined, threadId: string | undefined) =>
    projectId !== undefined || threadId === undefined || input.threadProjectId === undefined
      ? Effect.succeed(projectId)
      : input.threadProjectId(threadId).pipe(Effect.option, Effect.map(Option.getOrUndefined));
  const resolveDigestInput = (requested: string | undefined, threadId: string | undefined) =>
    callerProjectId(requested, threadId).pipe(
      Effect.flatMap((projectId) => digestInputFor(projectId)),
    );
  const digestInputFor = (projectId: string | undefined) =>
    input.projects
      .listShells(projectId === undefined ? undefined : { projectIds: [ProjectId.make(projectId)] })
      .pipe(
        Effect.mapError(message),
        Effect.map((shells) => toDigestInput(shells, projectId)),
        Effect.filterOrFail(
          (digest) => digest.projects.length > 0,
          () =>
            projectId === undefined
              ? "No project is bound to a Jira project, so there is no My Work digest."
              : `Project '${projectId}' is not bound to a Jira project, so it has no My Work digest.`,
        ),
      );

  return {
    readDigest: ({ projectId, threadId, scope }) =>
      Effect.gen(function* () {
        const digest = yield* scope === "all"
          ? digestInputFor(undefined)
          : resolveDigestInput(projectId, threadId);
        const payload = yield* input.loadDigest(digest);
        return yield* input.runStore(attachDigestArrangementOverlay(digest, payload));
      }),
    arrange: (args) =>
      Effect.gen(function* () {
        const mode = myWorkArrangeMode(args);
        if (!mode.ok) return yield* Effect.fail(mode.message);
        const own = yield* callerProjectId(undefined, args.threadId);
        if (
          args.scope !== "all" &&
          own !== undefined &&
          args.projectId !== undefined &&
          args.projectId !== own
        ) {
          return yield* Effect.fail(
            `This thread belongs to project '${own}'; it can only arrange that project's digest.`,
          );
        }
        if (mode.mode.type === "recipe") {
          if (input.writeRecipe === undefined) {
            return yield* Effect.fail("Saving a My Work recipe is not enabled in this runtime.");
          }
          const projectId = own ?? args.projectId;
          if (projectId === undefined) {
            return yield* Effect.fail("Saving a recipe needs the calling thread's project.");
          }
          const shells = yield* input.projects
            .listShells({ projectIds: [ProjectId.make(projectId)] })
            .pipe(Effect.mapError(message));
          const workspaceRoot = shells[0]?.workspaceRoot;
          if (workspaceRoot === undefined || workspaceRoot.length === 0) {
            return yield* Effect.fail("This project has no workspace to write a recipe into.");
          }
          const saved = yield* input.writeRecipe(workspaceRoot, args.recipe);
          return { ok: true, ...saved };
        }
        const digest = yield* args.scope === "all"
          ? digestInputFor(undefined)
          : resolveDigestInput(args.projectId ?? own, args.threadId);
        const key = digestArrangementKey(digest);
        if (key === undefined) {
          return yield* Effect.fail("Cannot resolve a viewer and scope for this arrangement.");
        }
        if (mode.mode.type === "reset") {
          yield* input.runStore(resetDigestArrangement(key.identity, key.scope));
          return { ok: true, scope: key.scope, arrangement: null };
        }
        if (mode.mode.type === "discardDraft") {
          yield* input.runStore(discardDigestDraft(key.identity, key.scope));
          return { ok: true, scope: key.scope, draftArrangement: null };
        }
        if (mode.mode.type === "promote") {
          const stored = yield* input.runStore(promoteDigestDraft(key.identity, key.scope));
          return { ok: true, scope: key.scope, arrangement: stored };
        }
        const producedAt = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis));
        const agentPlan = withAgentDefaults(args.plan, producedAt);
        if (agentPlan === undefined) {
          return yield* Effect.fail(
            "An arrangement stored by an agent must have producer 'agent'.",
          );
        }
        const stored = yield* input.runStore(
          mode.mode.channel === "draft"
            ? storeDigestDraft(key.identity, key.scope, agentPlan)
            : storeMyWorkLiveArrangement(key.identity, key.scope, agentPlan),
        );
        return { ok: true, scope: key.scope, channel: mode.mode.channel, arrangement: stored };
      }),
  };
};
