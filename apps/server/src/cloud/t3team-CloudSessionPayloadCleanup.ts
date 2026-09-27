import type { CloudSession, CloudSessionFailedError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import type * as VcsProcess from "../vcs/VcsProcess.ts";
import {
  apiArgs,
  type CloudSessionRepoRef,
  type GhInvocation,
  sessionTagMarker,
  type WorkflowRunSummary,
} from "./t3team-githubActionsSessionClient.ts";

/**
 * Deleting a session's spent credential payload issue from the creator side.
 *
 * The VM consumes the payload and closes + scrubs it, but it cannot delete it:
 * this GHE has no REST issue DELETE, and GraphQL `deleteIssue` needs repo admin,
 * which the job token never has. The creator's own `gh` login may, so once the
 * session is past the point where the VM reads the payload (ready, or already
 * over) the creator's server deletes it. When that fails too, it falls back to
 * close + scrub — which also covers a run that ended before it ever read the
 * payload and would otherwise leave a live credential open.
 */

/** The payload issue as the create response names it (never its body). */
export interface PayloadIssueRef {
  readonly number: number;
  readonly nodeId: string;
}

/** Body left behind when the issue cannot be deleted. */
export const SCRUBBED_PAYLOAD_BODY =
  "Consumed by the session that seeded this payload (single-use). The credential has been removed from this issue.";

/** Read `number` + `node_id` from a `POST /issues` response. */
export function parseCreatedPayloadIssue(stdout: string): PayloadIssueRef | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { number, node_id: nodeId } = parsed as { number?: unknown; node_id?: unknown };
  return typeof number === "number" && typeof nodeId === "string" && nodeId !== ""
    ? { number, nodeId }
    : null;
}

export function deleteIssueInvocation(ref: CloudSessionRepoRef, nodeId: string): GhInvocation {
  return {
    args: [
      ...apiArgs(ref, "graphql"),
      "-f",
      "query=mutation($issueId: ID!) { deleteIssue(input: {issueId: $issueId}) { clientMutationId } }",
      "-f",
      `issueId=${nodeId}`,
    ],
  };
}

export function closeAndScrubIssueInvocation(
  ref: CloudSessionRepoRef,
  issueNumber: number,
): GhInvocation {
  return {
    args: [
      ...apiArgs(ref, `repos/${ref.owner}/${ref.repo}/issues/${issueNumber}`),
      "--method",
      "PATCH",
      "--input",
      "-",
    ],
    stdin: JSON.stringify({ state: "closed", body: SCRUBBED_PAYLOAD_BODY }),
  };
}

type GhExecutor = (
  invocation: GhInvocation,
) => Effect.Effect<VcsProcess.VcsProcessOutput, CloudSessionFailedError>;

/** Phases in which the VM has read its payload, or never will. */
const PAYLOAD_SPENT_PHASES: ReadonlySet<CloudSession["phase"]> = new Set([
  "ready",
  "failed",
  "stopped",
  "cancelled",
]);

/**
 * Tracks the payload issues this server wrote and removes each exactly once.
 * In-memory on purpose: after a restart the VM's close + scrub still stands,
 * so a lost entry costs tidiness, never a leaked credential.
 */
export const makePayloadIssueCleanup = (repoRef: CloudSessionRepoRef, run: GhExecutor) =>
  Effect.gen(function* () {
    const pending = yield* Ref.make(new Map<string, PayloadIssueRef>());

    const remove = (issue: PayloadIssueRef) =>
      run(deleteIssueInvocation(repoRef, issue.nodeId)).pipe(
        Effect.tap(() => Effect.logInfo("Deleted cloud session payload issue " + issue.number)),
        Effect.catch(() => run(closeAndScrubIssueInvocation(repoRef, issue.number))),
        Effect.asVoid,
        Effect.catch(() =>
          Effect.logWarning(
            "Could not delete or scrub cloud session payload issue " + issue.number,
          ),
        ),
      );

    const track = (sessionTag: string, issue: PayloadIssueRef) =>
      Ref.update(pending, (map) => new Map(map).set(sessionTag, issue));

    /** Remove the payloads of listed runs whose sessions have spent them. */
    const sweep = (
      entries: ReadonlyArray<{ readonly run: WorkflowRunSummary; readonly session: CloudSession }>,
    ) =>
      Effect.gen(function* () {
        // Take the due entries atomically, so an overlapping list never
        // removes the same issue twice.
        const due = yield* Ref.modify(pending, (map) => {
          const taken = [...map].filter(([tag]) =>
            entries.some(
              ({ run: item, session }) =>
                item.name.includes(sessionTagMarker(tag)) &&
                PAYLOAD_SPENT_PHASES.has(session.phase),
            ),
          );
          if (taken.length === 0) return [taken, map] as const;
          const next = new Map(map);
          for (const [tag] of taken) next.delete(tag);
          return [taken, next] as const;
        });
        yield* Effect.forEach(due, ([, issue]) => remove(issue), { discard: true });
      });

    return { track, sweep } as const;
  });
