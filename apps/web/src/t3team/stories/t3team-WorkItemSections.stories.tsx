import type { Meta, StoryObj } from "@storybook/react";

import type {
  JiraAttachment,
  JiraCommentItem,
} from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemAttachments } from "~/t3team/workitem/t3team-WorkItemAttachments";
import { WorkItemChildren } from "~/t3team/workitem/t3team-WorkItemChildren";
import { WorkItemComments } from "~/t3team/workitem/t3team-WorkItemComments";
import { WorkItemLinks } from "~/t3team/workitem/t3team-WorkItemLinks";

const NOW_MS = Date.UTC(2026, 6, 25, 9, 30);
const DAY_MS = 24 * 60 * 60 * 1000;

const ATTACHMENTS: JiraAttachment[] = [
  {
    id: "1",
    filename: "viewport-drift-repro.png",
    mimeType: "image/png",
    content: "https://picsum.photos/seed/t3team-1/640/360",
    size: 482_000,
    author: "Ada Lovelace",
    created: new Date(NOW_MS - 3 * DAY_MS).toISOString(),
  },
  {
    id: "2",
    filename: "session-trace.har",
    mimeType: "application/json",
    content: "data:application/json,{}",
    size: 128_500,
    author: "Grace Hopper",
    created: new Date(NOW_MS - 2 * DAY_MS).toISOString(),
  },
  {
    id: "3",
    filename: "regression-notes.pdf",
    mimeType: "application/pdf",
    content: "data:application/pdf,",
    size: 51_200,
  },
  {
    id: "4",
    filename: "recording.mp4",
    mimeType: "video/mp4",
    content: "data:video/mp4,",
    size: 4_200_000,
  },
  {
    id: "5",
    filename: "does-not-load.png",
    mimeType: "image/png",
    content: "https://example.invalid/broken.png",
    size: 9_000,
  },
];

const COMMENTS: JiraCommentItem[] = Array.from({ length: 7 }, (_, index) => ({
  id: `c${index}`,
  author: index % 2 === 0 ? "Ada Lovelace" : "Grace Hopper",
  created: new Date(NOW_MS - (7 - index) * DAY_MS).toISOString(),
  updated:
    index === 1
      ? new Date(NOW_MS - (7 - index) * DAY_MS + 3 * 60 * 60 * 1000).toISOString()
      : new Date(NOW_MS - (7 - index) * DAY_MS).toISOString(),
  bodyMarkdown:
    index === 3
      ? "Only visible to the support queue — the customer never sees this thread."
      : `Update ${index + 1}: confirmed against 2026.7.2, retrying the mid-gesture repro.`,
  isInternal: index === 3,
}));

function ticket(input: {
  id: string;
  title: string;
  status: string;
  issueType?: string;
  assignee?: string;
}): ProjectTicket {
  return {
    id: input.id,
    projectId: "project-1",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: input.id,
      displayId: input.id,
      title: input.title,
      url: `https://example.atlassian.net/browse/${input.id}`,
      projectId: "EXT-1",
      type: input.issueType ?? "Task",
    },
    issueType: input.issueType ?? "Task",
    status: input.status,
    ...(input.assignee ? { assignee: input.assignee } : {}),
    updatedAt: new Date(NOW_MS).toISOString(),
  };
}

const CHILDREN: ProjectTicket[] = [
  ticket({ id: "KOOR-1483", title: "Restore camera from the session snapshot", status: "Done" }),
  ticket({
    id: "KOOR-1484",
    title: "Queue viewport writes during reconnect",
    status: "In Progress",
    assignee: "Ada Lovelace",
  }),
  ticket({ id: "KOOR-1491", title: "Regression test for refresh mid-gesture", status: "To Do" }),
];

const LINKED_ISSUES_RAW = {
  fields: {
    issuelinks: [
      {
        type: { inward: "is blocked by" },
        inwardIssue: { key: "KOOR-1201" },
      },
      {
        type: { outward: "blocks" },
        outwardIssue: { key: "KOOR-1512" },
      },
      {
        type: { inward: "relates to" },
        inwardIssue: { key: "KOOR-1290" },
      },
    ],
  },
};

function AllSections() {
  return (
    <div className="flex flex-col gap-5">
      <WorkItemChildren items={CHILDREN} />
      <WorkItemLinks snapshotRaw={LINKED_ISSUES_RAW} projectTickets={CHILDREN} projectId="EXT-1" />
      <WorkItemAttachments attachments={ATTACHMENTS} nowMs={NOW_MS} />
      <WorkItemComments comments={COMMENTS} nowMs={NOW_MS} />
    </div>
  );
}

/** Each frame fixes the *container* width, since the layout keys off `@container/workitem`. */
function Frame({ width, label }: { readonly width: string; readonly label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div
        style={{ width }}
        className="@container/workitem overflow-hidden rounded-xl border border-border bg-background p-4"
      >
        <AllSections />
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Sections",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Narrow: Story = {
  render: () => <Frame width="400px" label="400px" />,
};

export const Medium: Story = {
  render: () => <Frame width="800px" label="800px" />,
};

export const Wide: Story = {
  render: () => <Frame width="1200px" label="1200px" />,
};

export const ResponsiveLadder: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Frame width="400px" label="400px" />
      <Frame width="800px" label="800px" />
      <Frame width="1200px" label="1200px" />
    </div>
  ),
};
