import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { useComposerDraftStore } from "~/composerDraftStore";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { dropThreadContext } from "../chat/threadContextDrag";
import {
  FIXTURE_ENVIRONMENT_ID,
  makeThreadRowProps,
  makeThreadShell,
  ThreadRowHarness,
} from "./t3team-SidebarThreadRow.fixture";

const flags = vi.hoisted(() => ({ dropEnabled: true }));

vi.mock("~/t3team/t3team-useFeatureFlag", () => ({
  useFeatureFlag: () => flags.dropEnabled,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  readThreadShell: (ref: ScopedThreadRef) => ({ title: `Title of ${ref.threadId}` }) as never,
}));

function setup(options: { dropEnabled?: boolean } = {}) {
  flags.dropEnabled = options.dropEnabled ?? true;
}

function workItemRequest(overrides: Partial<AddToChatRequest> = {}): AddToChatRequest {
  return {
    projectId: "project-1",
    projectTitle: "Alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    payload: { description: "frozen at drop time" },
    ...overrides,
  };
}

function WorkItemSource(props: { request: AddToChatRequest }) {
  const dragProps = useT3TeamAgentContextDrag({
    label: props.request.targetLabel,
    capabilities: buildAddToChatAgentContextCapabilities(props.request, {
      tools: [
        { id: "t3_work_item_get", label: "Read work item", arguments: { issueKey: "PROJ-9" } },
      ],
    }),
  });
  return (
    <div {...dragProps} data-testid="work-item-source" className="p-2">
      PROJ-9
    </div>
  );
}

function rowFor(threadId: string, onThreadActivate = vi.fn(), isActive = false) {
  const thread = makeThreadShell({ id: ThreadId.make(threadId), title: `Row ${threadId}` });
  return {
    onThreadActivate,
    row: makeThreadRowProps({ thread, onThreadActivate, isActive, isRouteThread: isActive }),
    ref: scopeThreadRef(FIXTURE_ENVIRONMENT_ID, thread.id),
  };
}

function queuedFor(threadId: string) {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? [];
}

describe("sidebar thread row drops", () => {
  it("opens the thread and queues a work item as a reference without sending", async () => {
    setup();
    const { row, onThreadActivate, ref } = rowFor("thread-agent-drop");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource request={workItemRequest()} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );

    expect(onThreadActivate).toHaveBeenCalledExactlyOnceWith(ref);
    const [attachment] = queuedFor("thread-agent-drop");
    expect(attachment?.contextText).toContain("t3_work_item_get");
    expect(attachment?.contextText).not.toContain("frozen at drop time");
  });

  it("takes a drop on the row of the thread that is already open", async () => {
    setup();
    const { row, onThreadActivate, ref } = rowFor("thread-self-drop", vi.fn(), true);

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource request={workItemRequest()} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );

    expect(onThreadActivate).toHaveBeenCalledExactlyOnceWith(ref);
    expect(queuedFor("thread-self-drop")).toHaveLength(1);
  });

  it("rejects an item from another project", async () => {
    setup();
    const { row, onThreadActivate } = rowFor("thread-other-project");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource request={workItemRequest({ projectId: "project-2" })} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );

    expect(onThreadActivate).not.toHaveBeenCalled();
    expect(queuedFor("thread-other-project")).toEqual([]);
  });

  it("is not a drop target while the flag is off", async () => {
    setup({ dropEnabled: false });
    const { row, onThreadActivate } = rowFor("thread-flag-off");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource request={workItemRequest()} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );

    expect(onThreadActivate).not.toHaveBeenCalled();
    expect(queuedFor("thread-flag-off")).toEqual([]);
  });

  it("opens the thread and adds a dragged thread to its composer draft", async () => {
    setup();
    const { row, onThreadActivate, ref } = rowFor("thread-context-drop");

    await using screen = await render(<ThreadRowHarness row={row} />);
    const bounds = screen.getByTestId("sidebar-row-slim").element().getBoundingClientRect();
    const dropped = scopeThreadRef(FIXTURE_ENVIRONMENT_ID, ThreadId.make("thread-dragged"));
    const handled = dropThreadContext(
      { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 },
      [dropped],
    );

    expect(handled).toBe(true);
    expect(onThreadActivate).toHaveBeenCalledExactlyOnceWith(ref);
    const draft = useComposerDraftStore.getState().draftsByThreadKey;
    const contexts = Object.values(draft).flatMap((entry) => entry.threadContexts ?? []);
    expect(contexts.map((record) => record.contextId)).toEqual([
      expect.stringContaining("thread-dragged"),
    ]);
  });
});
