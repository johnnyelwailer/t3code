import type { Meta, StoryObj } from "@storybook/react-vite";

import { ContextAttachmentStrip } from "~/t3team/components/t3team-ContextAttachmentChip";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import {
  buildContextPointerAttachment,
  type ContextPointerState,
} from "~/t3team/t3team-referenceContextAttachment";

/**
 * The draft chip of an item dropped on a sidebar thread. The cached copy is written in the
 * thread's own environment after the drop; until it lands the chip says so, and sending is never
 * held back: the message goes out with the pointer as it stands.
 */
const meta = {
  title: "T3Team/Composer/Dropped Context Pointer",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const REQUEST: AddToChatRequest = {
  projectId: "project-1",
  projectTitle: "Alpha",
  targetLabel: "PROJ-9 Prepare release checklist",
  targetType: "work-item",
  kind: "jira-work-item",
  jiraIssueType: "Story",
  dedupeKey: "project-1:PROJ-9:work-item",
  payload: {},
  summaryItems: [
    { label: "Status", value: "In Progress" },
    { label: "Assignee", value: "Ada" },
  ],
};

const TOOL = { id: "t3_work_item_get", label: "Read work item", arguments: { issueKey: "PROJ-9" } };

function Chip({ state }: { state: ContextPointerState }) {
  return (
    <div className="w-96 p-3">
      <ContextAttachmentStrip
        attachments={[
          buildContextPointerAttachment({
            id: "pointer-1",
            request: REQUEST,
            tool: TOOL,
            addedAt: "2026-10-30T10:00:00.000Z",
            state,
          }),
        ]}
        onRemove={() => {}}
      />
    </div>
  );
}

export const PendingWhileSending: Story = { render: () => <Chip state={{ status: "pending" }} /> };

export const CachedCopyReady: Story = {
  render: () => (
    <Chip state={{ status: "ready", cachedPath: ".nexi/context/threads/thread-1/proj-9.json" }} />
  ),
};

export const CachedCopyUnavailable: Story = {
  render: () => <Chip state={{ status: "error", reason: "environment not connected" }} />,
};
