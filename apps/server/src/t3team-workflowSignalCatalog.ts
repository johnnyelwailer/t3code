/**
 * The host's built-in signal-source catalog (GHE #332, design 42 §8) — the EFFECTFUL half of
 * the built-in sources: the SDK (t3team-sdk.builtinSignals.ts) carries the shared DECLARATIONS
 * a body imports to bind a catalog source; this module carries the `start` behavior, keyed by
 * the same `name`, and is cross-checked against those declarations at boot so a rename breaks
 * LOUDLY here instead of silently leaving a body parked on a source the host cannot start.
 *
 *   • Tier A — `scm.change-request.watch / .checks / .review` (PullRequestService; provider
 *     agnostic). See t3team-workflowSignalSourceScm.ts.
 *   • Tier B — `work-item.updates` (Jira via the Atlassian provider; GH Issues / Azure Boards
 *     arrive with the work-item provider registry, not this PR). See
 *     t3team-workflowSignalSourceWorkItem.ts.
 *
 * Every `start` validates its params against the SDK's declaration schema before doing
 * anything: a malformed registration (a hand-written row, an older host) must fail the
 * instance's start, not the whole reconciler sweep.
 */

import {
  BUILTIN_SIGNAL_SOURCES,
  ScmChangeRequestParams,
  WorkItemParams,
  type SignalSourceContext,
  type SignalSourceInstance,
} from "@t3team/sdk";

import * as Schema from "effect/Schema";

import {
  startScmSignalInstance,
  WORKFLOW_SIGNAL_POLL_MS,
} from "./t3team-workflowSignalSourceScm.ts";
import { startWorkItemSignalInstance } from "./t3team-workflowSignalSourceWorkItem.ts";
import type {
  PullRequestActivity,
  PullRequestDetail,
  PullRequestRef,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { PullRequestError } from "./pullRequest/PullRequestService.ts";

/** The minimal PullRequestService surface the Tier A instances poll (detail + activity). */
export interface ScmPollSurface {
  readonly detail: (ref: PullRequestRef) => Effect.Effect<PullRequestDetail, PullRequestError>;
  readonly activity: (
    ref: PullRequestRef,
  ) => Effect.Effect<PullRequestActivity, PullRequestError>;
}

/** One catalog entry: the host's `start` behavior for a built-in source name. */
export interface WorkflowSignalSourceHost {
  readonly start: (ctx: SignalSourceContext<unknown>) => Promise<SignalSourceInstance>;
}

/** One catalog entry: the host's `start` behavior for a built-in source name. */
export interface WorkflowSignalSourceHost {
  readonly start: (ctx: SignalSourceContext<unknown>) => Promise<SignalSourceInstance>;
}

export interface WorkflowSignalSourceCatalog {
  /** Start a built-in source instance by name; `params` is the RAW stored params (validated
   * inside the host — the reconciler never trusts the row). Rejects when the name is unknown
   * or the params fail the declaration's schema. */
  readonly start: (
    sourceName: string,
    ctx: SignalSourceContext<unknown>,
  ) => Promise<SignalSourceInstance>;
  /** The built-in source names this host can start (the reconciler's known-instance filter). */
  readonly sourceNames: ReadonlySet<string>;
}

/**
 * Validate raw stored params against a declaration's identity schema (the instance-identity
 * half of the key must match what the SDK hashed at bind time).
 */
async function validateParams<Value>(
  schema: Schema.Schema<Value>,
  params: unknown,
  sourceName: string,
): Promise<Value> {
  try {
    return await Schema.decodeUnknownPromise(schema as never)(params);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Stored params for signal source '${sourceName}' failed its declaration schema: ${detail}`,
    );
  }
}

export function makeWorkflowSignalSourceCatalog(input: {
  readonly pullRequestService: ScmPollSurface;
  /** Injectable for tests; the built-in sources' default poll cadence. */
  readonly pollMs?: number;
  /** The work-item instances' provider resolution; injected by the reconciler (it carries the
   * ambient services the Atlassian auth read needs) and overridable in tests. */
  readonly resolveWorkItemProvider?: (
    accountId?: string,
  ) => Promise<import("@t3tools/integrations-atlassian").AtlassianIntegrationProvider | undefined>;
  readonly log?: (message: string, fields?: unknown) => void;
}): WorkflowSignalSourceCatalog {
  const pollMs = input.pollMs ?? WORKFLOW_SIGNAL_POLL_MS;
  const log = input.log ?? (() => {});
  const prs = input.pullRequestService;

  const scmHost: WorkflowSignalSourceHost = {
    start: async (ctx) => {
      await validateParams(
        ScmChangeRequestParams,
        (ctx as SignalSourceContext<unknown>).params,
        "scm.change-request",
      );
      return startScmSignalInstance({
        ctx: ctx as SignalSourceContext<{
          projectId: string;
          repository: string;
          number: number;
        }>,
        detail: (ref) => prs.detail(ref),
        activity: (ref) => prs.activity(ref),
        pollMs,
        log,
      });
    },
  };

  const workItemHost: WorkflowSignalSourceHost = {
    start: async (ctx) => {
      await validateParams(
        WorkItemParams,
        (ctx as SignalSourceContext<unknown>).params,
        "work-item.updates",
      );
      return startWorkItemSignalInstance({
        ctx: ctx as SignalSourceContext<{
          projectId: string;
          issueKey: string;
          accountId?: string;
        }>,
        pollMs,
        log,
        resolveProvider:
          input.resolveWorkItemProvider ??
          (async () => {
            throw new Error(
              "The work-item source host was not given a provider resolver; " +
                "the reconciler must wire resolveWorkItemProvider.",
            );
          }),
      });
    },
  };

  const hosts: Readonly<Record<string, WorkflowSignalSourceHost>> = {
    "scm.change-request.watch": scmHost,
    "scm.change-request.checks": scmHost,
    "scm.change-request.review": scmHost,
    "work-item.updates": workItemHost,
  };

  return {
    start: async (sourceName, ctx) => {
      const host = hosts[sourceName];
      if (host === undefined) {
        throw new Error(`Unknown built-in signal source: '${sourceName}'.`);
      }
      return host.start(ctx);
    },
    sourceNames: new Set(Object.keys(hosts)),
  };
}

/** Boot cross-check (design 42 §7): every SDK catalog declaration the host CANNOT start is a
 * loud boot failure — a rename on either side must break here, not leave a body parked on a
 * source that never starts. */
export function assertCatalogCoversDeclarations(
  catalog: WorkflowSignalSourceCatalog,
): void {
  const missing = [...BUILTIN_SIGNAL_SOURCES]
    .map((declaration) => declaration.name)
    .filter((name) => !catalog.sourceNames.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Signal source catalog is missing host implementations for: ${missing.join(", ")}. ` +
        "A built-in declaration was renamed or a catalog entry dropped — fix the catalog.",
    );
  }
}
