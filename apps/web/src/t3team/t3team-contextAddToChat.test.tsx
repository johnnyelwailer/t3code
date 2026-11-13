import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  contextStarters: false,
  shownMenus: [] as Array<ReadonlyArray<{ id: string }>>,
  addToChat: vi.fn(async () => undefined),
  dropOptions: null as null | { canDrop: (record: unknown) => boolean },
}));

vi.mock("~/t3team/t3team-contextStartersFlag", () => ({
  useContextStartersEnabled: () => harness.contextStarters,
}));
vi.mock("~/localApi", () => ({
  readLocalApi: () => ({
    contextMenu: {
      show: async (items: ReadonlyArray<{ id: string }>) => {
        harness.shownMenus.push(items);
        return items[0]?.id ?? null;
      },
    },
  }),
}));
vi.mock("~/t3team/hooks/t3team-useAddToChat", () => ({
  useAddToChat: () => ({ addToChatFromRequest: harness.addToChat }),
}));
vi.mock("~/t3team/t3team-pinnedSidebarStore", () => ({
  useT3TeamPinnedSidebarStore: (select: (state: object) => unknown) =>
    select({ pinItem: vi.fn(), unpinItems: vi.fn() }),
}));
vi.mock("~/t3team/t3team-sidebarNavPreferencesStore", () => ({
  useT3TeamSidebarNavPreferencesStore: (select: (state: object) => unknown) =>
    select({ showItemsAtTop: vi.fn(), removeItemsFromOrder: vi.fn() }),
}));
vi.mock("~/t3team/t3team-agentContextDrag", () => ({
  T3TeamAgentContextDropOverlay: () => null,
  useT3TeamAgentContextDropTarget: (options: { canDrop: (record: unknown) => boolean }) => {
    harness.dropOptions = options;
    return { isActive: false, dropProps: {} };
  },
}));

import { useAgentContext } from "~/t3team/hooks/t3team-useAgentContext";
import { useAddToChatComposerDropTarget } from "~/t3team/hooks/t3team-useAddToChatComposerDropTarget";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { ProjectSidebarTicketEntryActions } from "~/t3team/components/t3team-ProjectSidebarTicketEntryActions";
import { NewChatHereButton } from "~/t3team/t3team-NewChatHereButton";
import { StartChatHereProvider } from "~/t3team/t3team-startChatHereContext";

const capabilities: AgentContextCapabilities = {
  actions: [
    {
      id: "add-to-chat",
      label: "Add to chat",
      kind: "add-to-chat",
      request: {
        projectId: "project-pti",
        projectTitle: "PTI: POLAssist",
        targetLabel: "PTIPA-36 Editor: Befunde aus automatischen QA-Läufen 06.–09.11.2026",
        targetType: "work-item",
        kind: "jira-work-item",
        payload: { issueKey: "PTIPA-36" },
      },
    },
    {
      id: "pin-to-left",
      label: "Pin to left",
      kind: "pin-to-sidebar",
      item: {
        id: "PTIPA-36",
        kind: "jira-work-item",
        projectId: "project-pti",
        ticketId: "PTIPA-36",
        pinnedAt: "2026-11-13T09:00:00.000Z",
      },
    },
  ],
};

function AgentContextProbe({
  onRender,
}: {
  onRender: (value: ReturnType<typeof useAgentContext>) => void;
}) {
  onRender(useAgentContext());
  return null;
}

function captureAgentContext(): ReturnType<typeof useAgentContext> {
  const rendered: Array<ReturnType<typeof useAgentContext>> = [];
  renderToStaticMarkup(<AgentContextProbe onRender={(value) => rendered.push(value)} />);
  const [agentContext] = rendered;
  if (!agentContext) throw new Error("useAgentContext did not render");
  return agentContext;
}

function captureDropCanDrop(): (record: unknown) => boolean {
  function Probe() {
    useAddToChatComposerDropTarget();
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (!harness.dropOptions) throw new Error("drop target did not register");
  return harness.dropOptions.canDrop;
}

function renderEntryButtons(): string {
  return renderToStaticMarkup(
    <StartChatHereProvider value={vi.fn()}>
      <NewChatHereButton target={{ kind: "my-work", projectId: "project-pti" }} />
      <ProjectSidebarTicketEntryActions
        displayId="PTIPA-36"
        onCreateThread={vi.fn()}
        onOpenMenu={vi.fn()}
      />
    </StartChatHereProvider>,
  );
}

describe("work-item chat entry points behind CONTEXT_STARTERS", () => {
  it("offers no Add to chat, sidebar new-thread or New chat here with the default flags", async () => {
    harness.contextStarters = false;
    harness.shownMenus = [];
    const agentContext = captureAgentContext();

    await agentContext.showAgentContextMenuAt({ capabilities, x: 0, y: 0 });
    const ranAddToChat = await agentContext.runAgentContextAction(capabilities, "add-to-chat");
    const markup = renderEntryButtons();

    expect(harness.shownMenus).toEqual([[{ id: "pin-to-left", label: "Pin to left" }]]);
    expect(ranAddToChat).toBe(false);
    expect(harness.addToChat).not.toHaveBeenCalled();
    expect(captureDropCanDrop()({ capabilities })).toBe(false);
    expect(markup).not.toContain("New chat here");
    expect(markup).not.toContain("Create new thread for PTIPA-36");
    expect(markup).toContain("Issue actions for PTIPA-36");
  });

  it("restores all of them when the flag is on", async () => {
    harness.contextStarters = true;
    harness.shownMenus = [];
    const agentContext = captureAgentContext();

    await agentContext.showAgentContextMenuAt({ capabilities, x: 0, y: 0 });
    const markup = renderEntryButtons();

    expect(harness.shownMenus[0]?.map((item) => item.id)).toEqual(["add-to-chat", "pin-to-left"]);
    expect(harness.addToChat).toHaveBeenCalledTimes(1);
    expect(captureDropCanDrop()({ capabilities })).toBe(true);
    expect(markup).toContain("New chat here");
    expect(markup).toContain("Create new thread for PTIPA-36");
  });
});
