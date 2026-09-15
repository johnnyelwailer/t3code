/**
 * `environments` op for `t3team.thread.children` — the DISCOVERY half of the
 * cross-environment start_child feature: which environments can the caller
 * target through `t3team_start_child`'s `environment` argument?
 *
 * Read-only and additive: it returns the caller's OWN environment (marked as
 * the default) plus the distinct cross-environment bindings already recorded
 * on threads in this store (the `environment_json` column start_child stamps)
 * — i.e. the environments this host has demonstrably targeted before. No new
 * registry, no invented discovery protocol: the data source is the same
 * projection the rest of the tool reads. The result shape's `source`
 * discriminator ("own" | "history") is the seam a host-specific adapter
 * (e.g. a real environment registry) would enrich later.
 *
 * Delivery boundary (documented on every entry, per owner constraint): a
 * cross-environment child is created and bound on the target environment and
 * stays visible to this thread with its environment shown; inter-agent
 * messaging (send_message, mailbox, children ops) stays same-environment, so
 * report-back from a cross-environment child needs a separate channel.
 *
 * @module t3team-toolBrokerChildrenEnvironments
 */
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import { type ChildrenArgs, type T3TeamChildrenToolDeps } from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

/** One environment the caller can target through start_child `environment`. */
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
  "This environment (the default): children run here and stay fully reachable " +
  "through the normal inter-agent paths (send_message, mailbox, children ops).";
const CROSS_ENVIRONMENT_DELIVERY =
  "A cross-environment child: created and bound on THAT environment, visible to " +
  "this thread with its environment shown; inter-agent messaging (send_message, " +
  "mailbox, children ops) stays same-environment, so report-back needs a separate channel.";

type HistoryBinding = {
  readonly environmentId: string;
  readonly label?: string;
  readonly threadCount: number;
  readonly latestThreadAt: string;
};

/**
 * Merge own environment + recorded cross-env bindings into the op result.
 * Pure (no Effect) so the shape is unit-testable without a store.
 */
export function buildChildrenEnvironmentEntries(input: {
  readonly localEnvironmentId: string | undefined;
  readonly history: ReadonlyArray<HistoryBinding>;
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
  // Dedup per environmentId: the same environment may carry several recorded
  // label shapes (the store groups by the full JSON); the newest row wins
  // (rows arrive ordered by latestThreadAt desc, so first occurrence is newest).
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

export function opEnvironments(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult> {
  void args; // Read-only op; takes no arguments (unknown args are ignored, like `help`).
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
          "Targets for t3team_start_child `environment`: every entry states what a child " +
          "bound there gives you. Own-environment children are the default; cross-environment " +
          "children run on the target and stay visible here, but inter-agent messaging " +
          "(send_message, mailbox, children ops) only reaches threads in this environment, " +
          "so report-back from a cross-environment child needs a separate channel.",
        ...(hasOtherEnvironments
          ? {}
          : {
              hint: "No other environments are recorded in this store yet; start_child with " +
                "environment: { id, label } targets one by id once a host configuration or " +
                "a previous launch has recorded it.",
            }),
      });
    }),
    Effect.catch((error) => Effect.succeed(errorResult(`Failed to list target environments: ${error}`))),
  );
}
