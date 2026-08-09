import { useEffect, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import type { JiraCommentItem } from "~/t3team/components/ticket/t3team-ticketRichContentTypes";
import { useT3TeamDraftMutationStore } from "~/t3team/t3team-draftMutationStore";
import type { T3TeamDraftMutation } from "~/t3team/t3team-draftMutationTypes";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemDetailHeader } from "~/t3team/workitem/t3team-WorkItemDetailHeader";
import { WorkItemDetailMain } from "~/t3team/workitem/t3team-WorkItemDetailMain";
import type { WorkItemFieldModel } from "~/t3team/workitem/t3team-workItemFieldModel";

import { createWorkItemDetailMockBackend } from "./t3team-workItemDetailMockBackend";

const NOW_MS = Date.UTC(2026, 6, 25, 9, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_ID = "proj-koordination";

const MODEL: WorkItemFieldModel = {
  key: "KOOR-1482",
  title: "Reconnect the map viewport when a coordination session resumes after a token refresh",
  url: "https://example.atlassian.net/browse/KOOR-1482",
  issueType: "Bug",
  status: { name: "In Review", categoryKey: "indeterminate", categoryName: "In Progress" },
  priority: "High",
  assignee: { displayName: "Ada Lovelace" },
  reporter: { displayName: "Grace Hopper" },
  labels: ["viewport", "auth", "regression"],
  components: [{ name: "Map Engine" }, { name: "Session" }],
  fixVersions: [{ name: "2026.8" }],
  affectsVersions: [{ name: "2026.7" }],
  sprints: [{ name: "Koordination Sprint 31", state: "active" }],
  createdMs: NOW_MS - 19 * DAY_MS,
  updatedMs: NOW_MS - 3 * 60 * 60 * 1000,
  dueDateMs: NOW_MS - 2 * DAY_MS,
  storyPoints: 5,
  timeTracking: {
    originalEstimateSeconds: 8 * 3600,
    remainingEstimateSeconds: 2 * 3600,
    timeSpentSeconds: 6 * 3600,
  },
  parent: { key: "KOOR-1301", summary: "Session resilience", issueType: "Epic" },
  /** Exercises the ADF path, which is how real Jira descriptions arrive. */
  descriptionAdf: {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Resuming a coordination session after the access token " },
          { type: "text", text: "refreshes", marks: [{ type: "strong" }] },
          {
            type: "text",
            text: " leaves the map viewport pinned to its initial extent. The socket reconnects and layer state rehydrates, but the viewport controller never receives the restored camera.",
          },
        ],
      },
      {
        type: "panel",
        attrs: { panelType: "warning" },
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "The operator is silently looking at the wrong area — there is no visible failure.",
              },
            ],
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Reproduction" }],
      },
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Open a coordination session and pan the map." }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Force a token refresh mid-gesture (" },
                  { type: "text", text: "auth.refresh()", marks: [{ type: "code" }] },
                  { type: "text", text: ")." },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [
          {
            type: "text",
            text: "// viewport write is dropped before the controller mounts\ncontroller.restoreCamera(snapshot.camera);",
          },
        ],
      },
    ],
  },
};

function ticket(
  id: string,
  title: string,
  status: string,
  extra: Partial<ProjectTicket> = {},
): ProjectTicket {
  return {
    id,
    projectId: PROJECT_ID,
    ref: {
      provider: "atlassian",
      kind: "issue",
      id,
      displayId: id,
      title,
      type: extra.issueType ?? "Task",
      url: `https://example.atlassian.net/browse/${id}`,
      projectId: PROJECT_ID,
    },
    status,
    updatedAt: new Date(NOW_MS).toISOString(),
    ...extra,
  };
}

const CHILDREN: ProjectTicket[] = [
  ticket("KOOR-1483", "Restore camera from the session snapshot", "Done", {
    assignee: "Ada Lovelace",
  }),
  ticket("KOOR-1484", "Queue viewport writes during reconnect", "In Progress", {
    assignee: "Alan Turing",
  }),
  ticket("KOOR-1491", "Regression test for refresh mid-gesture", "To Do"),
];

const LINKED: ProjectTicket[] = [
  ticket("KOOR-1355", "Session token refresh drops socket subscriptions", "Done"),
  ticket("KOOR-1502", "Camera restore should be idempotent", "To Do"),
];

/** Shaped like `snapshot.raw` so the links section exercises its real extraction path. */
const SNAPSHOT_RAW = {
  fields: {
    issuelinks: [
      {
        type: { name: "Blocks", inward: "is blocked by", outward: "blocks" },
        outwardIssue: { key: "KOOR-1502", fields: { summary: LINKED[1]!.ref.title } },
      },
      {
        type: { name: "Relates", inward: "relates to", outward: "relates to" },
        inwardIssue: { key: "KOOR-1355", fields: { summary: LINKED[0]!.ref.title } },
      },
    ],
  },
};

const COMMENTS: JiraCommentItem[] = [
  {
    id: "c1",
    author: "Grace Hopper",
    created: new Date(NOW_MS - 3 * 60 * 60 * 1000).toISOString(),
    bodyMarkdown: "Confirmed against 2026.7.2. Trace attached.",
  },
  {
    id: "c2",
    author: "Ada Lovelace",
    created: new Date(NOW_MS - DAY_MS).toISOString(),
    updated: new Date(NOW_MS - DAY_MS + 20 * 60 * 1000).toISOString(),
    bodyMarkdown:
      "The camera restore lands before the controller mounts, so the write is dropped. Queuing it behind the mount fixes it locally.",
  },
  {
    id: "c3",
    author: "Support Bot",
    created: new Date(NOW_MS - 4 * DAY_MS).toISOString(),
    bodyMarkdown: "Customer confirmed the workaround is acceptable for this sprint.",
    isInternal: true,
  },
];

const ATTACHMENTS = [
  {
    id: "a1",
    filename: "viewport-drift.png",
    mimeType: "image/png",
    size: 284_512,
    author: "Grace Hopper",
    created: new Date(NOW_MS - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "a2",
    filename: "session-trace.har",
    mimeType: "application/json",
    size: 1_942_016,
    author: "Grace Hopper",
    created: new Date(NOW_MS - 3 * 60 * 60 * 1000).toISOString(),
  },
];

function WorkItemDetailPreview({ loading = false }: { readonly loading?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkItemDetailHeader
        breadcrumb={{
          projectTitle: "IES Koordination",
          itemKey: MODEL.key,
          ...(MODEL.parent ? { parent: MODEL.parent } : {}),
        }}
        {...(MODEL.url ? { externalUrl: MODEL.url } : {})}
        isRefreshing={loading}
        onBack={() => undefined}
        onRefresh={() => undefined}
      />
      <WorkItemDetailMain
        model={loading ? { ...MODEL, descriptionAdf: undefined } : MODEL}
        projectId={PROJECT_ID}
        childItems={CHILDREN}
        projectTickets={[...CHILDREN, ...LINKED]}
        snapshotRaw={SNAPSHOT_RAW}
        attachments={ATTACHMENTS}
        comments={COMMENTS}
        nowMs={NOW_MS}
        loading={loading}
        error={null}
        onReload={() => undefined}
        onOpenTicket={() => undefined}
      />
    </div>
  );
}

/**
 * Slice B: the same item, but with a live-feeling backend behind it — status, assignee and story
 * points are editable, and each write shows a brief pending state before it lands. `onReload` here
 * is a no-op because the mock backend already updates `model` directly; a real caller re-fetches.
 */
function EditableWorkItemDetailPreview() {
  const [model, setModel] = useState<WorkItemFieldModel>(MODEL);
  const [backend] = useState(() => createWorkItemDetailMockBackend(setModel));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkItemDetailHeader
        breadcrumb={{ projectTitle: "IES Koordination", itemKey: model.key }}
        isRefreshing={false}
        onBack={() => undefined}
        onRefresh={() => undefined}
      />
      <WorkItemDetailMain
        model={model}
        projectId={PROJECT_ID}
        accountId="acct-demo"
        externalProjectId="proj-demo"
        backend={backend as never}
        childItems={CHILDREN}
        projectTickets={[...CHILDREN, ...LINKED]}
        snapshotRaw={SNAPSHOT_RAW}
        attachments={ATTACHMENTS}
        comments={COMMENTS}
        nowMs={NOW_MS}
        loading={false}
        error={null}
        onReload={() => undefined}
        onOpenTicket={() => undefined}
      />
    </div>
  );
}

/**
 * A pending status and assignee draft for `MODEL.key`, shaped like what
 * `t3team-toolBrokerDraftMutations.ts` actually produces — same field names in `patch`.
 */
function agentDraftFixtures(status: "draft" | "applying"): readonly T3TeamDraftMutation[] {
  const target = { provider: "jira" as const, issueIdOrKey: MODEL.key };
  return [
    {
      id: "story-status-draft",
      createdAt: new Date(NOW_MS - 5 * 60 * 1000).toISOString(),
      target,
      field: "status",
      status,
      patch: { targetStatus: "Done" },
      summary: "The linked PR merged this morning.",
    },
    {
      id: "story-assignee-draft",
      createdAt: new Date(NOW_MS - 2 * 60 * 1000).toISOString(),
      target,
      field: "assignee",
      status,
      patch: { assigneeAccountId: "acc-alan", assigneeDisplayName: "Alan Turing" },
      summary: "Alan opened the fix PR.",
    },
  ];
}

/** Same editable preview, seeded with the two drafts above so the review affordance is visible. */
function EditableWorkItemDetailPreviewWithDrafts({
  draftStatus,
}: {
  readonly draftStatus: "draft" | "applying";
}) {
  useEffect(() => {
    useT3TeamDraftMutationStore.setState({ drafts: agentDraftFixtures(draftStatus) });
    return () => useT3TeamDraftMutationStore.setState({ drafts: [] });
  }, [draftStatus]);

  return <EditableWorkItemDetailPreview />;
}

/**
 * Each story fixes the *container* width rather than the viewport. The layout keys off the element's
 * own width, so a wrapper of a given width reproduces exactly what the real pane looks like at that
 * width — including a narrow pane on a large display, which a viewport-based story cannot show.
 */
function Frame({
  width,
  label,
  loading = false,
  height,
}: {
  readonly width: string;
  readonly label: string;
  readonly loading?: boolean;
  /** Shorter frames for the ladder, where three stack in one view. */
  readonly height?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div
        style={{ width, ...(height ? { height } : {}) }}
        /* Viewport-relative so a single story always fits the window without the canvas clipping. */
        className="h-[min(44rem,80vh)] overflow-hidden rounded-xl border border-border bg-background"
      >
        <WorkItemDetailPreview loading={loading} />
      </div>
    </div>
  );
}

const meta = {
  title: "T3Team/Work Item Detail",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Phone: Story = {
  render: () => <Frame width="360px" label="360px — small phone" />,
};

export const NarrowPane: Story = {
  render: () => <Frame width="520px" label="520px — detail pane with the agent panel open" />,
};

export const Tablet: Story = {
  render: () => <Frame width="768px" label="768px — tablet" />,
};

export const Laptop: Story = {
  render: () => <Frame width="1100px" label="1100px — laptop, rail visible" />,
};

export const Desktop: Story = {
  render: () => <Frame width="1400px" label="1400px — desktop" />,
};

export const Ultrawide: Story = {
  render: () => <Frame width="1900px" label="1900px — ultrawide, description and activity split" />,
};

export const FirstLoad: Story = {
  render: () => <Frame width="1100px" label="1100px — first load, description skeleton" loading />,
};

export const ResponsiveLadder: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Frame width="360px" label="360px — small phone" height="30rem" />
      <Frame width="520px" label="520px — detail pane with the agent panel open" height="30rem" />
      <Frame width="900px" label="900px — rail appears" height="30rem" />
    </div>
  ),
};

/**
 * Slice B: status, assignee and story points are live. Click a value to open its picker — status and
 * assignee popovers commit only when you pick something; story points opens a small editor where
 * Enter saves and Escape restores. Every successful write shows a brief "field → value · Undo".
 */
export const Editable: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        1100px — status, assignee and story points are editable against a mock backend
      </p>
      <div className="h-[min(44rem,80vh)] w-[1100px] overflow-hidden rounded-xl border border-border bg-background">
        <EditableWorkItemDetailPreview />
      </div>
    </div>
  ),
};

/**
 * An agent proposed a status change and an assignee change. Both review in place — the marker on
 * the status badge and assignee chip, Accept/Dismiss underneath — rather than in a separate queue.
 * Click Accept to see it commit through the same mock-backend mutation a direct edit would use.
 */
export const WithAgentDrafts: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        1100px — a pending status draft and a pending assignee draft, at rest
      </p>
      <div className="h-[min(44rem,80vh)] w-[1100px] overflow-hidden rounded-xl border border-border bg-background">
        <EditableWorkItemDetailPreviewWithDrafts draftStatus="draft" />
      </div>
    </div>
  ),
};

/** Same two drafts, frozen mid-accept: Accept/Dismiss disabled while the commit is in flight. */
export const WithAgentDraftsAccepting: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        1100px — the same drafts mid-accept (Accept/Dismiss disabled while applying)
      </p>
      <div className="h-[min(44rem,80vh)] w-[1100px] overflow-hidden rounded-xl border border-border bg-background">
        <EditableWorkItemDetailPreviewWithDrafts draftStatus="applying" />
      </div>
    </div>
  ),
};
