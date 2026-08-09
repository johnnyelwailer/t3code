import type { Meta, StoryObj } from "@storybook/react";

import { T3TeamMessageAttachmentList } from "~/t3team/chat/t3team-messageAttachmentList";
import { T3TeamWorkItemDraftRefCard } from "~/t3team/chat/t3team-WorkItemDraftRefCard";

const ATTACHMENT = {
  kind: "work-item-draft",
  projectId: "project-1",
  issueIdOrKey: "NXAI-6",
  field: "description",
  summary: "Rewrote the description with acceptance criteria and named the Dev-Rolle owner.",
} as never;

const meta = {
  title: "T3Team/Work Item Draft Ref Card",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** How the completion card reads in the timeline: the agent's own sentence, then one click to the draft. */
export const InTimeline: Story = {
  render: () => (
    <div className="max-w-xl">
      <T3TeamMessageAttachmentList attachments={[ATTACHMENT]} onOpenWorkItemDraft={() => {}} />
    </div>
  ),
};

/** No summary on the attachment — the card borrows the message body's first sentence. */
export const SummaryFromMessageBody: Story = {
  render: () => {
    const { summary: _omitted, ...withoutSummary } = ATTACHMENT as Record<string, unknown>;
    return (
      <div className="max-w-xl">
        <T3TeamMessageAttachmentList
          attachments={[withoutSummary as never]}
          fallbackText="I rewrote the description of NXAI-6. It now states the role's responsibilities."
          onOpenWorkItemDraft={() => {}}
        />
      </div>
    );
  },
};

/** History: no navigation handler, so the card states the fact without offering a dead click. */
export const WithoutNavigation: Story = {
  render: () => (
    <div className="max-w-xl rounded-lg border border-border/55 bg-background/65 px-3 py-2">
      <T3TeamWorkItemDraftRefCard attachment={ATTACHMENT} />
    </div>
  ),
};
