/* oxlint-disable t3code/no-native-title-tooltip -- Mirrors the sidebar rows' native provider-icon title. */
/**
 * "Local provider sessions" setting toggle — the display-side contract.
 *
 * The toggle must be safe in both directions:
 * - OFF hides already-adopted local provider sessions from the thread lists
 *   (the filter in t3team-externalSessionState applied to the rows the
 *   sidebar section renders). Nothing is deleted.
 * - ON restores the same rows, same content, no re-sync.
 *
 * Each story feeds the real `ProjectSidebarProjectThreadSection` the output of
 * `filterLocalProviderSessionThreads` for its toggle state — the same call the
 * app shell makes (t3team-App / t3team-AppMainContent via
 * useLocalProviderSessionThreadFilter) — so these captures ARE the before/
 * after evidence for the toggle.
 */
import type { Meta, StoryObj } from "@storybook/react";

import { SidebarProvider } from "~/t3team/components/ui/t3team-sidebar";
import { ProjectSidebarProjectThreadSection } from "~/t3team/components/t3team-ProjectSidebarProjectThreadSection";
import { filterLocalProviderSessionThreads } from "~/t3team/chat/t3team-externalSessionState";
import type { ProjectThread } from "~/t3team/t3team-types";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

const CODEX_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const threads: ProjectThread[] = [
  {
    id: "t-app",
    projectId: "p1",
    title: "Fix the failing retry test",
    messageCount: 14,
    lastMessageAt: iso(48 * 60 * 60 * 1000),
    createdAt: iso(72 * 60 * 60 * 1000),
    status: "idle",
  },
  {
    id: "t-codex",
    projectId: "p1",
    title: "Codex · refactor auth middleware",
    providerKind: "codex",
    messageCount: 8,
    lastMessageAt: iso(CODEX_ACTIVE_WINDOW_MS / 2),
    createdAt: iso(6 * 60 * 60 * 1000),
    status: "idle",
  },
  {
    id: "t-claude",
    projectId: "p1",
    title: "Claude · investigate flaky e2e",
    providerKind: "claudeAgent",
    messageCount: 5,
    lastMessageAt: iso(30 * 60 * 60 * 1000),
    createdAt: iso(36 * 60 * 60 * 1000),
    status: "idle",
  },
];

const noOp = () => undefined;

function Section({ visibleThreads }: { visibleThreads: ProjectThread[] }) {
  return (
    <SidebarProvider
      className="h-dvh w-[360px] overflow-hidden bg-sidebar text-sidebar-foreground"
      defaultOpen
    >
      <div className="px-2 pt-4">
        <div className="mb-2 flex items-center gap-2 rounded-md bg-accent/60 px-2 py-1.5 text-xs font-medium">
          <span className="truncate">my-project</span>
        </div>
        <ProjectSidebarProjectThreadSection
          projectId="p1"
          workspaceRoot="/Users/dev/my-project"
          view={null}
          visibleThreads={visibleThreads}
          hasOverflowingThreads={false}
          expandedThreadList={true}
          onExpandedThreadListChange={noOp}
          onSelectThread={noOp}
          onDeleteThread={noOp}
          onRenameThread={noOp}
        />
      </div>
    </SidebarProvider>
  );
}

const meta: Meta = {
  title: "Local provider sessions toggle",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

export const ToggleOnAllSessionsVisible: Story = {
  name: "Toggle ON — all sessions visible",
  parameters: {
    docs: {
      description: {
        story:
          "Local provider sessions setting ON (default once adopted): app threads and the two adopted external sessions (provider marks + active lock on the codex one) all render.",
      },
    },
  },
  render: () => <Section visibleThreads={filterLocalProviderSessionThreads(threads, true)} />,
};

export const ToggleOffAdoptedSessionsHidden: Story = {
  name: "Toggle OFF — adopted sessions hidden",
  parameters: {
    docs: {
      description: {
        story:
          "Local provider sessions setting OFF: the filter hides both adopted external sessions; the app thread stays. Same rows, same store — turning the toggle back on restores them (no re-sync, no delete).",
      },
    },
  },
  render: () => <Section visibleThreads={filterLocalProviderSessionThreads(threads, false)} />,
};
