import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import { pickScalarDraft, useWorkItemDrafts } from "~/t3team/workitem/t3team-useWorkItemDrafts";
import { useWorkItemFieldMutations } from "~/t3team/workitem/t3team-useWorkItemFieldMutations";
import { WorkItemAssigneeControl } from "~/t3team/workitem/t3team-WorkItemAssigneeControl";
import { WorkItemDescriptionDraftDiff } from "~/t3team/workitem/t3team-WorkItemDescriptionDraftDiff";
import { useWorkItemDraftReviewUiStore } from "~/t3team/workitem/t3team-workItemDraftReviewUiStore";
import { WorkItemDraftStripMount } from "~/t3team/workitem/t3team-WorkItemDraftStripMount";
import { WorkItemStatusControl } from "~/t3team/workitem/t3team-WorkItemStatusControl";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

import { createWorkItemDetailMockBackend } from "./t3team-workItemDetailMockBackend";

const ISSUE_KEY = "KOOR-1482";
const PROJECT_ID = "proj-koordination";
const CURRENT_TEXT =
  "Resuming a coordination session after the access token refreshes leaves the map viewport pinned to its initial extent.";
const PROPOSED_TEXT =
  "Resuming a coordination session after the access token refreshes carefully re-centers the map viewport on the operator's last known position.";

const MODEL: WorkItemFieldModel = {
  key: ISSUE_KEY,
  title: "Reconnect the map viewport after a token refresh",
  status: { name: "In Review", categoryKey: "indeterminate" },
  assignee: { displayName: "Ada Lovelace" },
  storyPoints: 5,
  labels: [],
  components: [],
  fixVersions: [],
  affectsVersions: [],
  sprints: [],
};

/** Same shapes `t3team-toolBrokerDraftMutations.ts` actually produces. */
function draftFixtures(): readonly T3TeamDraftMutation[] {
  const target = { provider: "jira" as const, issueIdOrKey: ISSUE_KEY };
  return [
    {
      id: "story-status",
      createdAt: "2026-07-20T09:00:00.000Z",
      target,
      field: "status",
      status: "draft",
      patch: { targetStatus: "Done" },
      summary: "The linked PR merged this morning.",
    },
    {
      id: "story-assignee",
      createdAt: "2026-07-20T09:05:00.000Z",
      target,
      field: "assignee",
      status: "draft",
      patch: { assigneeAccountId: "acc-alan", assigneeDisplayName: "Alan Turing" },
      summary: "Alan opened the fix PR.",
    },
    {
      id: "story-description",
      createdAt: "2026-07-20T09:10:00.000Z",
      target,
      field: "description",
      status: "draft",
      proposedContent: { format: "markdown", body: PROPOSED_TEXT },
      summary: "Rewrote the fix behavior.",
    },
  ];
}

/**
 * The chip and the strip share one `useWorkItemFieldMutation` instance per field
 * (`useWorkItemFieldMutations`) — accepting a draft from the strip below must show the exact same
 * "Status → Done · Undo" banner, in the same place, that a direct edit on the chip would.
 */
function StripDemo() {
  useEffect(() => {
    useT3TeamDraftMutationStore.setState({ drafts: draftFixtures() });
    useWorkItemDraftReviewUiStore.getState().openStrip(ISSUE_KEY);
    return () => {
      useT3TeamDraftMutationStore.setState({ drafts: [] });
      useWorkItemDraftReviewUiStore.getState().closeStrip();
    };
  }, []);

  const backend = createWorkItemDetailMockBackend(() => undefined);
  const draftsByField = useWorkItemDrafts({ issueIdOrKey: ISSUE_KEY });
  const mutations = useWorkItemFieldMutations({
    issueIdOrKey: ISSUE_KEY,
    model: MODEL,
    backend: backend as never,
    accountId: "acct-demo",
    onReload: () => undefined,
  });

  return (
    <div className="w-[720px] space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        <WorkItemStatusControl
          backend={backend as never}
          accountId="acct-demo"
          externalProjectId="proj-demo"
          issueIdOrKey={ISSUE_KEY}
          status={MODEL.status}
          draft={pickScalarDraft(draftsByField, "status")}
          mutation={mutations.status}
        />
        <WorkItemAssigneeControl
          backend={backend as never}
          accountId="acct-demo"
          issueIdOrKey={ISSUE_KEY}
          draft={pickScalarDraft(draftsByField, "assignee")}
          mutation={mutations.assignee}
        />
      </div>
      <WorkItemDraftStripMount
        issueIdOrKey={ISSUE_KEY}
        projectId={PROJECT_ID}
        model={MODEL}
        mutations={mutations}
        backend={backend as never}
        accountId="acct-demo"
        onReload={() => undefined}
        descriptionCurrentText={CURRENT_TEXT}
        onReviewDescription={() => undefined}
        onReviewComments={() => undefined}
      />
    </div>
  );
}

function DescriptionDiffDemo() {
  useEffect(() => {
    useT3TeamDraftMutationStore.setState({ drafts: draftFixtures() });
    return () => useT3TeamDraftMutationStore.setState({ drafts: [] });
  }, []);

  return (
    <div className="w-[640px]">
      <WorkItemDescriptionDraftDiff issueIdOrKey={ISSUE_KEY} projectId={PROJECT_ID} currentText={CURRENT_TEXT} />
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Draft Strip",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The status and assignee chips sit above the strip, sharing its exact mutation instances. The one
 * panel every field marker and the nav pill open: two scalar rows resolve right here
 * (Accept/Comment/Dismiss), the description row shows its magnitude and hands off to the inline
 * diff. Click the checkmark on the Status row, then look at the chip above it — same undo banner,
 * same place, as a direct edit.
 */
export const Strip: Story = {
  render: () => <StripDemo />,
};

/**
 * What "Review in place" opens for a description draft: a real word-level diff against the current
 * text, using the shared diff primitives. Select any sentence to leave a comment — while one is
 * unsent, Accept is disabled.
 */
export const DescriptionDiff: Story = {
  render: () => <DescriptionDiffDemo />,
};
