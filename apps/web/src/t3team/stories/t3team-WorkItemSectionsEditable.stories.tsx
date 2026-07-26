import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";

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

type DemoIssueLink = {
  id: string;
  type: { name: string; inward: string; outward: string };
  inwardIssue?: { key: string };
  outwardIssue?: { key: string };
};

const INITIAL_COMMENTS: JiraCommentItem[] = [
  {
    id: "c1",
    author: "Ada Lovelace",
    created: new Date(NOW_MS - 86_400_000).toISOString(),
    bodyMarkdown: "First pass looks good — retrying the mid-gesture repro now.",
  },
];

const INITIAL_LINKS: ReadonlyArray<DemoIssueLink> = [
  {
    id: "link-1",
    type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
    inwardIssue: { key: "KOOR-1201" },
  },
];

/**
 * A believable-enough in-memory Atlassian backend for the comment/link/child mutation stories.
 *
 * Deletes deliberately do NOT trigger a re-render by themselves — only `reload()` does, mirroring
 * the real backend (an HTTP DELETE returns void; the client's list only changes once `onReload()`
 * re-fetches). Mutating the rendered state directly on delete would unmount the row — and its
 * "Comment deleted / Link removed · Undo" banner — before the 10s undo window ever showed.
 */
function useEditableSectionsDemo() {
  const serverComments = useRef<JiraCommentItem[]>([...INITIAL_COMMENTS]);
  const serverLinks = useRef<DemoIssueLink[]>([...INITIAL_LINKS]);
  const [comments, setComments] = useState(serverComments.current);
  const [links, setLinks] = useState(serverLinks.current);
  const [children, setChildren] = useState<ProjectTicket[]>([
    ticket("KOOR-1483", "Restore camera from the session snapshot", "Done"),
  ]);

  const reload = () => {
    setComments([...serverComments.current]);
    setLinks([...serverLinks.current]);
  };

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
      serverComments.current = [
        ...serverComments.current,
        { id, author: "You", created: new Date().toISOString(), bodyMarkdown: body },
      ];
      setComments(serverComments.current);
      return { id };
    },
    updateIssueComment: async ({ commentId, body }) => {
      serverComments.current = serverComments.current.map((c) =>
        c.id === commentId ? { ...c, bodyMarkdown: body } : c,
      );
      setComments(serverComments.current);
    },
    deleteIssueComment: async ({ commentId }) => {
      serverComments.current = serverComments.current.filter((c) => c.id !== commentId);
    },
    createIssueLink: async ({ otherIssueIdOrKey, linkTypeName, direction }) => {
      serverLinks.current = [
        ...serverLinks.current,
        {
          id: `link-${Math.random().toString(36).slice(2, 8)}`,
          type: {
            name: linkTypeName,
            inward: `is ${linkTypeName.toLowerCase()}ed by`,
            outward: linkTypeName.toLowerCase(),
          },
          ...(direction === "inward"
            ? { inwardIssue: { key: otherIssueIdOrKey } }
            : { outwardIssue: { key: otherIssueIdOrKey } }),
        },
      ];
      setLinks(serverLinks.current);
    },
    deleteIssueLink: async ({ linkId }) => {
      serverLinks.current = serverLinks.current.filter((link) => link.id !== linkId);
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

  return {
    comments,
    links: { fields: { issuelinks: links } },
    children,
    backend: backend as unknown as AtlassianBackendApi,
    reload,
  };
}

function EditableSections() {
  const { comments, links, children, backend, reload } = useEditableSectionsDemo();

  return (
    <div className="@container/workitem flex max-w-2xl flex-col gap-5">
      <WorkItemChildren
        items={children}
        backend={backend}
        accountId={ACCOUNT_ID}
        projectId="EXT-1"
        issueIdOrKey="KOOR-1"
        onReload={reload}
      />
      <WorkItemLinks
        snapshotRaw={links}
        projectTickets={children}
        projectId="EXT-1"
        backend={backend}
        accountId={ACCOUNT_ID}
        issueIdOrKey="KOOR-1"
        onReload={reload}
      />
      <WorkItemComments
        comments={comments}
        nowMs={NOW_MS}
        backend={backend}
        accountId={ACCOUNT_ID}
        issueIdOrKey="KOOR-1"
        onReload={reload}
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
