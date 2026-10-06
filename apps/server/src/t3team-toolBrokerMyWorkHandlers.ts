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
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import type { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import {
  attachDigestArrangement,
  clearDigestArrangement,
  digestArrangementKey,
  storeDigestArrangement,
} from "./t3team-myworkDigestArrangement.ts";
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
    readDigest: ({ projectId, threadId }) =>
      Effect.gen(function* () {
        const digest = yield* resolveDigestInput(projectId, threadId);
        const payload = yield* input.loadDigest(digest);
        return yield* input.runStore(attachDigestArrangement(digest, payload));
      }),
    arrange: ({ projectId, plan, reset, threadId }) =>
      Effect.gen(function* () {
        // Writes stay in the caller's project: a thread in project A cannot rearrange B's digest.
        const own = yield* callerProjectId(undefined, threadId);
        if (own !== undefined && projectId !== undefined && projectId !== own) {
          return yield* Effect.fail(
            `This thread belongs to project '${own}'; it can only arrange that project's digest.`,
          );
        }
        const digest = yield* resolveDigestInput(projectId ?? own, threadId);
        const key = digestArrangementKey(digest);
        if (key === undefined) {
          return yield* Effect.fail("Cannot resolve a viewer and scope for this arrangement.");
        }
        if (reset === true) {
          yield* input.runStore(clearDigestArrangement(key.identity, key.scope));
          return { ok: true, scope: key.scope, arrangement: null };
        }
        const producedAt = DateTime.formatIso(DateTime.makeUnsafe(yield* Clock.currentTimeMillis));
        const agentPlan = withAgentDefaults(plan, producedAt);
        if (agentPlan === undefined) {
          return yield* Effect.fail(
            "An arrangement stored by an agent must have producer 'agent'.",
          );
        }
        const stored = yield* input.runStore(
          storeDigestArrangement(key.identity, key.scope, agentPlan),
        );
        return { ok: true, scope: key.scope, arrangement: stored };
      }),
  };
};
