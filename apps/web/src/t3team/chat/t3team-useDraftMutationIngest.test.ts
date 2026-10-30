import { describe, expect, it } from "vite-plus/test";
import type { T3TeamThreadArtifact } from "@t3tools/contracts";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";

import { collectT3TeamDraftMutations, ingestThreadDrafts } from "./t3team-useDraftMutationIngest";

type IngestArtifact = Pick<T3TeamThreadArtifact, "kind" | "payload" | "createdAt">;

function draftMessage(input: {
  readonly id: string;
  readonly field?: "assignee" | "description";
  readonly createdAt?: string;
}): IngestArtifact {
  const field = input.field ?? "assignee";
  return {
    createdAt: input.createdAt ?? "2026-07-26T10:00:00.000Z",
    kind: "draft-mutation",
    payload: {
      kind: "draft-mutation",
      draft: {
        id: input.id,
        kind: "jira-work-item-draft",
        tool: "t3team.work_item.assignee.draft_update",
        target: { provider: "jira", issueIdOrKey: "PROJ-42" },
        field,
        patch:
          field === "description"
            ? { description: "New description body." }
            : { assigneeAccountId: "abc-123" },
        status: "draft",
        summary: "Drafted assigning PROJ-42.",
        commitPolicy: { requiresUserApproval: true, commitSurface: "t3team-ui" },
      },
    },
  };
}

describe("collectT3TeamDraftMutations", () => {
  it("turns a draft attachment into a store draft stamped with the reading thread", () => {
    const collected = collectT3TeamDraftMutations({
      artifacts: [draftMessage({ id: "jira-draft:m1" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      id: "jira-draft:m1",
      sourceThreadId: "thread-1",
      createdAt: "2026-07-26T10:00:00.000Z",
      field: "assignee",
      status: "draft",
      summary: "Drafted assigning PROJ-42.",
      target: { provider: "jira", issueIdOrKey: "PROJ-42" },
    });
    // No projectId is stamped — the filter must stay permissive, see the module doc.
    expect(collected[0]).not.toHaveProperty("projectId");
  });

  it("leaves out a draft a change-set card owns", () => {
    const collected = collectT3TeamDraftMutations({
      artifacts: [draftMessage({ id: "jira-draft:m1" }), draftMessage({ id: "jira-draft:m2" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
      ownedDraftIds: new Set(["jira-draft:m1"]),
    });

    expect(collected.map((draft) => draft.id)).toEqual(["jira-draft:m2"]);
  });

  it("maps a document draft's patch onto proposedContent", () => {
    const [draft] = collectT3TeamDraftMutations({
      artifacts: [draftMessage({ id: "jira-draft:m2", field: "description" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(draft).toMatchObject({
      field: "description",
      proposedContent: { format: "markdown", body: "New description body." },
    });
  });

  it("skips drafts the store already holds, so a reviewed draft is never resurrected", () => {
    const collected = collectT3TeamDraftMutations({
      artifacts: [draftMessage({ id: "jira-draft:m1" }), draftMessage({ id: "jira-draft:m3" })],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(["jira-draft:m1"]),
    });

    expect(collected.map((draft) => draft.id)).toEqual(["jira-draft:m3"]);
  });

  it("ignores other artifact kinds and undecodable draft payloads", () => {
    const collected = collectT3TeamDraftMutations({
      artifacts: [
        { createdAt: "2026-07-26T10:00:00.000Z", kind: "widget", payload: {} },
        { createdAt: "2026-07-26T10:01:00.000Z", kind: "draft-mutation", payload: { bad: 1 } },
      ],
      sourceThreadId: "thread-1",
      knownDraftIds: new Set(),
    });

    expect(collected).toEqual([]);
  });
});

describe("ingestThreadDrafts with a change set", () => {
  const member: FixtureMember = {
    id: "jira-draft:cs1",
    issueKey: "PROJ-1",
    field: "status",
    patch: { targetStatus: "Done" },
  };
  const stored = () => useT3TeamDraftMutationStore.getState().drafts.map((draft) => draft.id);
  const reset = () => useT3TeamDraftMutationStore.setState({ drafts: [] });
  const ingest = (status?: "draft" | "discarded", withSet = true) =>
    ingestThreadDrafts({
      threadId: FIXTURE_THREAD_ID,
      artifacts: [
        memberArtifact(member),
        ...(withSet
          ? [changeSetArtifact({ title: "t", members: [member], ...(status ? { status } : {}) })]
          : []),
      ],
    });

  it("keeps an open set's members out of the per-draft review", () => {
    reset();
    ingest();
    expect(stored()).toEqual([]);
  });

  it("removes a member ingested before its set arrived", () => {
    reset();
    ingest(undefined, false);
    expect(stored()).toEqual(["jira-draft:cs1"]);
    ingest();
    expect(stored()).toEqual([]);
  });

  it("offers the members again when the set never arrived, or was discarded", () => {
    reset();
    ingest(undefined, false);
    expect(stored()).toEqual(["jira-draft:cs1"]);
    reset();
    ingest("discarded");
    expect(stored()).toEqual(["jira-draft:cs1"]);
  });
});
