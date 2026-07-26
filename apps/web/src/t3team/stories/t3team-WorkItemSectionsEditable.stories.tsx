import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import type { AtlassianBackendApi } from "~/t3team/backend/t3team-atlassianBackendTypes";
import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemChildren } from "~/t3team/workitem/t3team-WorkItemChildren";
import { WorkItemComments } from "~/t3team/workitem/t3team-WorkItemComments";
import { WorkItemLinks } from "~/t3team/workitem/t3team-WorkItemLinks";

const NOW_MS = Date.UTC(2026, 6, 26, 9, 30);
const ACCOUNT_ID = "demo-account";

function ticket(id: string, title: string, status: string): ProjectTicket {
  return {
    id,
    projectId: "project-1",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id,
      displayId: id,
      title,
      url: `https://example.atlassian.net/browse/${id}`,
      projectId: "EXT-1",
      type: "Task",
    },
    issueType: "Task",
    status,
    updatedAt: new Date(NOW_MS).toISOString(),
  };
}

/**
 * A believable-enough in-memory Atlassian backend for the comment/link/child mutation stories:
 * only the write ops these sections call are implemented, cast past the rest of
 * `AtlassianBackendApi` the same way `t3team-workItemDetailMockBackend.ts` already does.
 */
function useEditableSectionsDemo() {
  const [comments, setComments] = useState<JiraCommentItem[]>([
    {
      id: "c1",
      author: "Ada Lovelace",
      created: new Date(NOW_MS - 86_400_000).toISOString(),
      bodyMarkdown: "First pass looks good — retrying the mid-gesture repro now.",
    },
  ]);
  type DemoIssueLink = {
    id: string;
    type: { name: string; inward: string; outward: string };
    inwardIssue?: { key: string };
    outwardIssue?: { key: string };
  };
  const [links, setLinks] = useState<{ fields: { issuelinks: DemoIssueLink[] } }>(() => ({
    fields: {
      issuelinks: [
        {
          id: "link-1",
          type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
          inwardIssue: { key: "KOOR-1201" },
        },
      ],
    },
  }));
  const [children, setChildren] = useState<ProjectTicket[]>([
    ticket("KOOR-1483", "Restore camera from the session snapshot", "Done"),
  ]);

  const backend: Pick<
    AtlassianBackendApi,
    | "addIssueComment"
    | "updateIssueComment"
    | "deleteIssueComment"
    | "createIssueLink"
    | "deleteIssueLink"
    | "listIssueLinkTypes"
    | "createSubtask"
  > = {
    addIssueComment: async ({ body }) => {
      const id = `c${Math.random().toString(36).slice(2, 8)}`;
      setComments((current) => [
        ...current,
        { id, author: "You", created: new Date().toISOString(), bodyMarkdown: body },
      ]);
      return { id };
    },
    updateIssueComment: async ({ commentId, body }) => {
      setComments((current) =>
        current.map((c) => (c.id === commentId ? { ...c, bodyMarkdown: body } : c)),
      );
    },
    deleteIssueComment: async ({ commentId }) => {
      setComments((current) => current.filter((c) => c.id !== commentId));
    },
    createIssueLink: async ({ otherIssueIdOrKey, linkTypeName, direction }) => {
      setLinks((current) => ({
        fields: {
          issuelinks: [
            ...current.fields.issuelinks,
            {
              id: `link-${Math.random().toString(36).slice(2, 8)}`,
              type: { name: linkTypeName, inward: `is ${linkTypeName.toLowerCase()}ed by`, outward: linkTypeName.toLowerCase() },
              ...(direction === "inward"
                ? { inwardIssue: { key: otherIssueIdOrKey } }
                : { outwardIssue: { key: otherIssueIdOrKey } }),
            },
          ],
        },
      }));
    },
    deleteIssueLink: async ({ linkId }) => {
      setLinks((current) => ({
        fields: { issuelinks: current.fields.issuelinks.filter((link) => link.id !== linkId) },
      }));
    },
    listIssueLinkTypes: async () => [
      { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
      { id: "2", name: "Relates", inward: "relates to", outward: "relates to" },
    ],
    createSubtask: async ({ summary }) => {
      const id = `KOOR-${Math.floor(1000 + Math.random() * 9000)}`;
      setChildren((current) => [...current, ticket(id, summary, "To Do")]);
      return { id, key: id };
    },
  };

  return { comments, links, children, backend: backend as unknown as AtlassianBackendApi };
}

function EditableSections() {
  const { comments, links, children, backend } = useEditableSectionsDemo();
  const [, forceRender] = useState(0);
  const onReload = () => forceRender((n) => n + 1);

  return (
    <div className="@container/workitem flex max-w-2xl flex-col gap-5">
      <WorkItemChildren
        items={children}
        backend={backend}
        accountId={ACCOUNT_ID}
        projectId="EXT-1"
        issueIdOrKey="KOOR-1"
        onReload={onReload}
      />
      <WorkItemLinks
        snapshotRaw={links}
        projectTickets={children}
        projectId="EXT-1"
        backend={backend}
        accountId={ACCOUNT_ID}
        issueIdOrKey="KOOR-1"
        onReload={onReload}
      />
      <WorkItemComments
        comments={comments}
        nowMs={NOW_MS}
        backend={backend}
        accountId={ACCOUNT_ID}
        issueIdOrKey="KOOR-1"
        onReload={onReload}
      />
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Sections (editable)",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/** Comment create/edit/delete, issue link create/delete, and child creation — each going through
 * the same backend calls the direct controls and accepted agent drafts both use. */
export const Editable: Story = {
  render: () => <EditableSections />,
};
