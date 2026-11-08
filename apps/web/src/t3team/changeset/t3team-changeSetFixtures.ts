import type { T3TeamDraftMutationField, T3TeamThreadArtifact } from "@t3tools/contracts";
import { hashDraftPayload } from "@t3tools/shared/t3team-workItemChangeSetHash";

export const FIXTURE_THREAD_ID = "thread-1";

export type FixtureMember = {
  readonly id: string;
  readonly issueKey: string;
  readonly field: T3TeamDraftMutationField;
  readonly patch: Record<string, unknown>;
  readonly status?: "draft" | "applied" | "dismissed";
  readonly summary?: string;
  /** Hash is taken from `patch` unless this differs: simulates a payload edited after publish. */
  readonly storedPatch?: Record<string, unknown>;
  readonly threadId?: string;
};

const at = "2026-10-30T09:00:00.000Z";

const artifact = (
  id: string,
  kind: string,
  threadId: string,
  payload: unknown,
): T3TeamThreadArtifact =>
  ({ id, threadId, messageId: null, kind, payload, createdAt: at, updatedAt: at }) as never;

export function memberArtifact(member: FixtureMember): T3TeamThreadArtifact {
  return artifact(member.id, "draft-mutation", member.threadId ?? FIXTURE_THREAD_ID, {
    kind: "draft-mutation",
    draft: {
      id: member.id,
      kind: "jira-work-item-draft",
      tool: "t3_work_item_draft",
      target: { provider: "jira", issueIdOrKey: member.issueKey },
      field: member.field,
      patch: member.storedPatch ?? member.patch,
      status: member.status ?? "draft",
      ...(member.summary ? { summary: member.summary } : {}),
      commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
    },
  });
}

/** A change set over `members`, hashed from each member's `patch` as the server does at publish. */
export function changeSetArtifact(input: {
  readonly id?: string;
  readonly title: string;
  readonly members: ReadonlyArray<FixtureMember>;
  readonly status?: "draft" | "discarded";
}): T3TeamThreadArtifact {
  const id = input.id ?? "jira-changeset:set-1";
  return artifact(id, "work-item-change-set", FIXTURE_THREAD_ID, {
    kind: "work-item-change-set",
    id,
    title: input.title,
    sourceThreadId: FIXTURE_THREAD_ID,
    createdAt: at,
    status: input.status ?? "draft",
    operations: input.members.map((member) => ({
      draftId: member.id,
      issueKey: member.issueKey,
      field: member.field,
      summary: member.summary ?? `${member.field} on ${member.issueKey}`,
      payloadHash: hashDraftPayload({
        target: { provider: "jira", issueIdOrKey: member.issueKey },
        field: member.field,
        patch: member.patch,
      }),
    })),
  });
}
