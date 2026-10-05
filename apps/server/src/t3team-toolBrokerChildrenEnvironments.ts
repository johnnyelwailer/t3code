/**
 * `environments` op for `t3team.thread.children`: which environments can the
 * caller target through delegate_task's `extensions.environment`?
 *
 * Read-only: this server's OWN environment (the default) plus the distinct
 * cross-environment bindings already recorded on threads here (the thread
 * facts the delegate_task extension writes). The result's `source`
 * discriminator ("own" | "history") is the seam a host-specific environment
 * registry would enrich.
 *
 * Delivery boundary (stated on every entry): a cross-environment child is
 * bound to the target environment and stays visible here, but messaging and
 * completion wakes only reach threads in this environment.
 *
 * @module t3team-toolBrokerChildrenEnvironments
 */
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import {
  type EnvironmentBindingSummary,
  type T3TeamChildrenToolDeps,
} from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

/** One environment the caller can target through delegate_task `extensions.environment`. */
export type ChildrenEnvironmentEntry = {
  readonly environmentId: string;
  readonly label?: string;
  readonly source: "own" | "history";
  /** Own entries are the default target; history entries are past bindings. */
  readonly isDefault: boolean;
  /** How many THIS store's threads are bound to the environment (own: 0). */
  readonly childrenCount: number;
  readonly delivery: string;
};

const OWN_ENVIRONMENT_DELIVERY =
  "This environment (the default): children run here, their completion wakes this " +
  "thread, and messaging reaches them.";
const CROSS_ENVIRONMENT_DELIVERY =
  "A cross-environment child: bound to THAT environment and visible here with its " +
  "environment shown; messaging and completion wakes stay in this environment, so " +
  "report-back needs a separate channel.";

/**
 * Merge own environment + recorded cross-env bindings into the op result.
 * Pure (no Effect) so the shape is unit-testable without a store.
 */
export function buildChildrenEnvironmentEntries(input: {
  readonly localEnvironmentId: string | undefined;
  readonly history: ReadonlyArray<EnvironmentBindingSummary>;
}): ChildrenEnvironmentEntry[] {
  const localId = input.localEnvironmentId?.trim();
  const own: ChildrenEnvironmentEntry[] = localId
    ? [
        {
          environmentId: localId,
          source: "own",
          isDefault: true,
          childrenCount: 0,
          delivery: OWN_ENVIRONMENT_DELIVERY,
        },
      ]
    : [];
  // Dedup per environmentId; rows arrive newest first, so the first occurrence wins.
  const seen = new Set<string>();
  const history: ChildrenEnvironmentEntry[] = [];
  for (const row of input.history) {
    const environmentId = row.environmentId.trim();
    if (environmentId.length === 0 || environmentId === localId) continue;
    if (seen.has(environmentId)) continue;
    seen.add(environmentId);
    history.push({
      environmentId,
      ...(row.label ? { label: row.label } : {}),
      source: "history",
      isDefault: false,
      childrenCount: row.threadCount,
      delivery: CROSS_ENVIRONMENT_DELIVERY,
    });
  }
  return [...own, ...history];
}

/** Read-only; takes no arguments (unknown args are ignored, like `help`). */
export function opEnvironments(deps: T3TeamChildrenToolDeps): Effect.Effect<T3TeamToolCallResult> {
  return deps.listEnvironmentBindings().pipe(
    Effect.map((history) => {
      const environments = buildChildrenEnvironmentEntries({
        localEnvironmentId: deps.localEnvironmentId,
        history,
      });
      const hasOtherEnvironments = environments.length > 1;
      return okResult({
        ok: true,
        op: "environments",
        environments,
        delivery_boundary:
          "Targets for delegate_task extensions.environment: every entry states what a child " +
          "bound there gives you. Own-environment children are the default; cross-environment " +
          "children stay visible here, but messaging and completion wakes only reach threads " +
          "in this environment, so report-back from them needs a separate channel.",
        ...(hasOtherEnvironments
          ? {}
          : {
              hint:
                "No other environments are recorded here yet; delegate_task with " +
                "extensions.environment { id, label } targets one by id.",
            }),
      });
    }),
    Effect.catch((error) =>
      Effect.succeed(errorResult(`Failed to list target environments: ${error}`)),
    ),
  );
}
