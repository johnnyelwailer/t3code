import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectShellProject } from "@t3tools/project-context";
import {
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagKey,
} from "@t3tools/project-context/t3teamFeatureFlags";
import { describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({ flags: {} as Record<string, boolean> }));

vi.mock("~/t3team/t3team-useFeatureFlag", () => {
  const read = (key: FeatureFlagKey) =>
    harness.flags[key] ?? FEATURE_FLAG_DEFINITIONS[key]?.defaultEnabled ?? false;
  return {
    readServerFeatureFlag: (_config: unknown, key: FeatureFlagKey) => read(key),
    readServerFeatureFlagOr: (_config: unknown, key: FeatureFlagKey, legacy: boolean) =>
      harness.flags[key] ?? legacy,
    useFeatureFlag: read,
  };
});

vi.mock("~/rpc/serverState", () => ({ useServerConfig: () => null }));

import {
  DigestTicketChatProvider,
  useDigestTicketChatActions,
  type DigestTicketChatActions,
} from "~/t3team/t3team-digestTicketChatContext";
import { hidesContextStarterSection } from "~/t3team/t3team-contextStarters";
import { useT3TeamSidecarRecipeQuickStarts } from "~/t3team/t3team-sidecarRecipes";

const project: ProjectShellProject = {
  id: "project-pti" as ProjectShellProject["id"],
  title: "PTI: POLAssist",
  source: { provider: "atlassian", externalProjectId: "PTIPA", raw: {} },
  workspace: { rootPath: "/tmp/project-pti", createdAt: "2026-11-01T09:00:00.000Z" },
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
};

const chatActions: DigestTicketChatActions = {
  onKickoffThread: vi.fn(),
  onOpenThread: vi.fn(),
  onOpenFullThread: vi.fn(),
  onThreadKickoffConsumed: vi.fn(),
};

function BacklogStarters() {
  const quickStarts = useT3TeamSidecarRecipeQuickStarts({
    backend: null,
    surface: "project.dashboard",
    project,
    profileId: undefined,
    selectedWorkLabel: project.title,
    dashboardMode: "backlog",
    availableContextKeys: ["project.summary", "dashboard.backlog.summary"],
  });
  return <span>{quickStarts.map((recipe) => recipe.id).join(",")}</span>;
}

function WorkItemStarters() {
  const quickStarts = useT3TeamSidecarRecipeQuickStarts({
    backend: null,
    surface: "workitem.detail.sidepanel",
    project,
    profileId: undefined,
    selectedWorkLabel: "PTIPA-36",
    selectedWorkTitle: "Editor: Befunde aus automatischen QA-Läufen 06.–09.11.2026",
    resourceKind: "ticket",
    availableContextKeys: ["project.summary", "ticket.summary", "selected-work.summary"],
  });
  const chat = useDigestTicketChatActions();
  return (
    <div>
      <span data-testid="starters">{quickStarts.map((recipe) => recipe.id).join(",")}</span>
      <span data-testid="chat">{chat ? "chat-tab" : "no-chat-tab"}</span>
    </div>
  );
}

function renderEntryPoints(flags: Record<string, boolean>): string {
  harness.flags = flags;
  return renderToStaticMarkup(
    <DigestTicketChatProvider value={chatActions}>
      <WorkItemStarters />
    </DigestTicketChatProvider>,
  );
}

describe("contextual starters behind CONTEXT_STARTERS", () => {
  it("offers no work-item recipe starter and no ticket Chat tab with the default flags", () => {
    const markup = renderEntryPoints({});

    expect(markup).toContain('<span data-testid="starters"></span>');
    expect(markup).toContain("no-chat-tab");
  });

  it("restores the starters and the Chat tab when both flags are on", () => {
    const markup = renderEntryPoints({ CONTEXT_STARTERS: true, BUNDLED_RECIPE_EXAMPLES: true });

    expect(markup).toContain("explain-selected-work");
    expect(markup).toContain(">chat-tab<");
  });

  it("restores only the authoring entry and the Chat tab when the examples flag stays off", () => {
    const markup = renderEntryPoints({ CONTEXT_STARTERS: true });

    expect(markup).toContain(">manage-project-recipes<");
    expect(markup).not.toContain("explain-selected-work");
    expect(markup).toContain(">chat-tab<");
  });

  it("keeps the backlog's one-click assignee filter, which runs no agent, with the default flags", () => {
    harness.flags = {};
    const markup = renderToStaticMarkup(<BacklogStarters />);

    expect(markup).toContain("show-only-assigned-to-me");
    expect(markup).not.toContain("summarize-project-risk");
    expect(hidesContextStarterSection("project.dashboard.backlog", false)).toBe(false);
    expect(hidesContextStarterSection("workitem.detail.sidepanel", false)).toBe(true);
    expect(hidesContextStarterSection("project.dashboard.myWork", false)).toBe(true);
  });
});
