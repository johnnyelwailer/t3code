import type { Meta, StoryObj } from "@storybook/react";

import {
  changeSetArtifact,
  FIXTURE_THREAD_ID,
  memberArtifact,
  type FixtureMember,
} from "~/t3team/changeset/t3team-changeSetFixtures";
import { WorkItemChangeSetPanel } from "~/t3team/changeset/t3team-WorkItemChangeSetPanel";

const member = (
  n: number,
  issueKey: string,
  field: FixtureMember["field"],
  patch: Record<string, unknown>,
  extra: Partial<FixtureMember> = {},
): FixtureMember => ({ id: `jira-draft:story-${n}`, issueKey, field, patch, ...extra });

const MEMBERS: ReadonlyArray<FixtureMember> = [
  member(1, "KOOR-1482", "status", { targetStatus: "In Review" }),
  member(2, "KOOR-1482", "estimate", { estimateMode: "points", estimateValue: 5 }),
  member(3, "KOOR-1482", "description", {
    description:
      "Resuming a coordination session after the access token refreshes re-centers the map viewport on the operator's last known position.\n\nAcceptance: the viewport follows the operator within one second of resume.",
  }),
  member(4, "KOOR-1490", "assignee", {
    assigneeAccountId: "u-ada",
    assigneeDisplayName: "Ada Lovelace",
  }),
  member(5, "KOOR-1490", "comment", {
    body: "Split out of KOOR-1482; keeps the token refresh work separate.",
  }),
  member(6, "KOOR-1490", "subtask", {
    summary: "Cover the refresh path with a replay test",
    estimateHours: 3,
  }),
  member(7, "KOOR-1501", "estimate", { estimateMode: "hours", estimateValue: 8 }),
  member(8, "KOOR-1501", "link", {
    otherIssueIdOrKey: "KOOR-1482",
    linkTypeName: "Blocks",
    direction: "outward",
  }),
  member(9, "KOOR-1503", "status", { targetStatus: "Done" }, { status: "applied" }),
  member(10, "KOOR-1503", "assignee", { assigneeAccountId: null }, { status: "dismissed" }),
  member(
    11,
    "KOOR-1507",
    "status",
    { targetStatus: "Done" },
    { storedPatch: { targetStatus: "Cancelled" } },
  ),
  member(12, "KOOR-1507", "comment", { body: "Closing: shipped in 2.14." }),
];

const artifacts = [
  ...MEMBERS.map(memberArtifact),
  changeSetArtifact({ title: "Triage the coordination backlog", members: MEMBERS }),
];

const settle = () => Promise.resolve();

const meta = {
  title: "T3Team/Work Item/Change Set Card",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** A 12-operation set mixing proposed, applied, dismissed and changed-since-proposed operations. */
export const TwelveOperations: Story = {
  render: () => (
    <div className="max-w-2xl border border-border">
      <WorkItemChangeSetPanel
        threadId={FIXTURE_THREAD_ID}
        artifacts={artifacts}
        deps={{ acceptOp: settle, record: settle, recordDiscard: settle }}
      />
    </div>
  ),
};

/** Apply approved with writes failing for two operations: the rest land, the failures offer a retry. */
export const PartialFailure: Story = {
  render: () => (
    <div className="max-w-2xl border border-border">
      <WorkItemChangeSetPanel
        threadId={FIXTURE_THREAD_ID}
        artifacts={artifacts}
        deps={{
          acceptOp: (draft) =>
            ["jira-draft:story-2", "jira-draft:story-6"].includes(draft.id)
              ? Promise.reject(new Error("Jira rejected the update (400)."))
              : settle(),
          record: settle,
          recordDiscard: settle,
        }}
      />
    </div>
  ),
  play: () => {
    const apply = [...document.querySelectorAll("button")].find((button) =>
      /Apply approved/.test(button.textContent ?? ""),
    );
    apply?.click();
  },
};

/** No connected Atlassian account: the set can be reviewed and discarded, not applied. */
export const WithoutAccount: Story = {
  render: () => (
    <div className="max-w-2xl border border-border">
      <WorkItemChangeSetPanel
        threadId={FIXTURE_THREAD_ID}
        artifacts={artifacts}
        deps={{ record: settle, recordDiscard: settle }}
      />
    </div>
  ),
};
