import {
  ReferenceLinkedThreadsResult,
  ReferenceOperationError,
  type ThreadPullRequestKey,
  type ProjectId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";

import { listLinkedPullRequestThreads } from "../pullRequest/linkedThreads.ts";
import {
  readDigestHandoffTickets,
  readDigestToolContextTickets,
} from "../t3team-myworkDigestQueries.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

const decodeReferenceResult = Schema.decodeUnknownEffect(ReferenceLinkedThreadsResult);

/**
 * Roster a pull request's threads. Delegates to the PR link query (source-control, so it needs a
 * resolved host-level key — the caller resolves `PullRequestRef` -> key upstream) and tags every
 * row `linked`: a thread only shows here if it was explicitly linked to the PR.
 */
export const listReferencePullRequestThreads = Effect.fn("listReferencePullRequestThreads")(
  function* (key: ThreadPullRequestKey) {
    const result = yield* listLinkedPullRequestThreads(key);
    const threads = result.threads.map((thread) => ({ ...thread, source: "linked" as const }));
    return yield* decodeReferenceResult({ threads });
  },
  Effect.mapError((cause) =>
    new ReferenceOperationError({
      operation: "linkedThreads",
      detail: "Could not load pull request threads.",
      cause,
    }),
  ),
);

/**
 * Roster a work item's threads: every live thread in the project (subagents included) whose active
 * claim is this ticket. The claim is read hot (the in-memory tool context of a running turn) and
 * cold (the persisted child-thread metadata), hot winning.
 *
 * U3 TODO — linked threads: once `thread.workItems` shell-link lands, join the work item's linked
 * threads here and tag them `source: "linked"`. Until then the roster is claim-only; the claim
 * filter above (and the two claim maps it merges) is the single place to fold that join into.
 */
export const listReferenceWorkItemThreads = Effect.fn("listReferenceWorkItemThreads")(
  function* (input: { readonly projectId: ProjectId; readonly ticketId: string }) {
    const threadManagement = yield* ThreadManagementService;
    const threads = yield* threadManagement.listProjectThreads({
      projectId: input.projectId,
      includeSubagents: true,
    });
    const candidateIds = threads.map((thread) => thread.id);
    const [hot, cold] = yield* Effect.all([
      readDigestToolContextTickets(candidateIds),
      readDigestHandoffTickets(candidateIds),
    ]);
    const claimed = threads.filter((thread) => {
      const ticketId = hot.get(thread.id) ?? cold.get(thread.id);
      return ticketId !== undefined && ticketId === input.ticketId;
    });
    const threadsOut = claimed.map((thread) => ({
      id: thread.id,
      projectId: thread.projectId,
      title: thread.title,
      archivedAt: thread.archivedAt === null ? null : DateTime.formatIso(thread.archivedAt),
      source: "claimed" as const,
    }));
    return yield* decodeReferenceResult({ threads: threadsOut });
  },
  Effect.mapError((cause) =>
    new ReferenceOperationError({
      operation: "linkedThreads",
      detail: "Could not load work item threads.",
      cause,
    }),
  ),
);
