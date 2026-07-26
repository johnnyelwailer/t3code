import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { ChildIssueCreatePanel } from "~/t3team/t3team-ChildIssueCreatePanel";
import {
  EMPTY_CHILD_ISSUE_CREATE_DRAFT,
  type ChildIssueCreateDraft,
} from "~/t3team/t3team-childIssueCreateTypes";

const DEMO_PEOPLE = [
  { accountId: "acc-ada", displayName: "Ada Lovelace", emailAddress: "ada@example.test" },
  { accountId: "acc-alan", displayName: "Alan Turing", emailAddress: "alan@example.test" },
];

function DemoPanel({
  childIssueTypes,
}: {
  readonly childIssueTypes: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [draft, setDraft] = useState<ChildIssueCreateDraft>(EMPTY_CHILD_ISSUE_CREATE_DRAFT);

  return (
    <div className="max-w-md">
      <ChildIssueCreatePanel
        parentDisplayId="KOOR-1"
        draft={draft}
        saving={false}
        error={null}
        currentUserName="Ada Lovelace"
        className="space-y-2.5 rounded-lg border border-border/70 bg-card/30 p-3"
        searchAssignableUsers={async (query) => {
          const normalized = query?.trim().toLowerCase() ?? "";
          if (!normalized) return DEMO_PEOPLE;
          return DEMO_PEOPLE.filter((p) => p.displayName.toLowerCase().includes(normalized));
        }}
        listChildIssueTypes={async () => childIssueTypes}
        onDraftChange={setDraft}
        onCancel={() => setDraft(EMPTY_CHILD_ISSUE_CREATE_DRAFT)}
        onSubmit={() => {
          // Storybook demo only — the real submit goes through `backend.createSubtask`.
        }}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Child Issue Create Form",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** The common case: one subtask-shaped type, so the issue-type field shows the resolved default
 * disabled instead of a picker with nothing to pick between. */
export const SingleIssueType: Story = {
  render: () => <DemoPanel childIssueTypes={[{ id: "1", name: "Subtask" }]} />,
};

/** A project with more than one subtask-shaped type gets a real picker. */
export const MultipleIssueTypes: Story = {
  render: () => (
    <DemoPanel
      childIssueTypes={[
        { id: "1", name: "Subtask" },
        { id: "2", name: "Technical task" },
      ]}
    />
  ),
};
