import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { useT3TeamThreadContextQueue } from "~/t3team/chat/t3team-useThreadContextQueue";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import {
  FIXTURE_ENVIRONMENT_ID,
  makeThreadRowProps,
  makeThreadShell,
  ThreadRowHarness,
} from "./t3team-SidebarThreadRow.fixture";
import { ThreadId } from "@t3tools/contracts";

// A cached-copy write that never lands: navigation and send must complete without it.
vi.mock("~/t3team/t3team-contextCacheWrite", () => ({
  writeContextCache: () => new Promise<string>(() => {}),
}));

const REQUEST: AddToChatRequest = {
  projectId: "project-1",
  projectTitle: "Alpha",
  targetLabel: "PROJ-9 Prepare release checklist",
  targetType: "work-item",
  kind: "jira-work-item",
  payload: { description: "never inlined" },
};

function WorkItemSource() {
  const dragProps = useT3TeamAgentContextDrag({
    label: REQUEST.targetLabel,
    capabilities: buildAddToChatAgentContextCapabilities(REQUEST, {
      tools: [{ id: "t3_work_item_get", label: "Read", arguments: { issueKey: "PROJ-9" } }],
    }),
  });
  return (
    <div {...dragProps} data-testid="work-item-source">
      PROJ-9
    </div>
  );
}

/** The composer's side of the queue: what ChatView mounts, plus the send path's context step. */
function ComposerQueue({ threadId }: { threadId: string }) {
  const queue = useT3TeamThreadContextQueue({
    environmentId: FIXTURE_ENVIRONMENT_ID,
    threadId,
    enabled: true,
  });
  const [sent, setSent] = useState("");
  return (
    <div data-testid="composer">
      {queue.strip}
      <button
        type="button"
        onClick={async () => {
          const prepared = await queue.prepare();
          setSent(prepared.map((attachment) => attachment.contextText).join("\n"));
          queue.onConsumed();
        }}
      >
        Send
      </button>
      <div data-testid="sent">{sent}</div>
    </div>
  );
}

function rowFor(threadId: string) {
  const thread = makeThreadShell({ id: ThreadId.make(threadId), title: `Row ${threadId}` });
  const onThreadActivate = vi.fn();
  return {
    onThreadActivate,
    threadId,
    row: makeThreadRowProps({ thread, onThreadActivate }),
  };
}

describe("thread context queue", () => {
  it("shows what was dropped while the composer was not mounted, once it opens", async () => {
    const { row, threadId, onThreadActivate } = rowFor("thread-open-later");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );
    expect(onThreadActivate).toHaveBeenCalledExactlyOnceWith(
      scopeThreadRef(FIXTURE_ENVIRONMENT_ID, row.thread.id),
    );
    await screen.rerender(
      <ThreadRowHarness row={row}>
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );

    await expect.element(screen.getByText("PROJ-9 Prepare release checklist")).toBeVisible();
  });

  it("navigates away and back while the cached copy is still pending", async () => {
    const { row, threadId } = rowFor("thread-away-and-back");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource />
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );
    await expect.element(screen.getByText("PROJ-9 Prepare release checklist")).toBeVisible();
    await screen.rerender(<ThreadRowHarness row={row} />);
    await screen.rerender(
      <ThreadRowHarness row={row}>
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );

    await expect.element(screen.getByText("PROJ-9 Prepare release checklist")).toBeVisible();
  });

  it("sends with the pointer as it stands while the cached copy is still pending", async () => {
    const { row, threadId } = rowFor("thread-send-pending");

    await using screen = await render(
      <ThreadRowHarness row={row}>
        <WorkItemSource />
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await vi.waitFor(() =>
      expect(screen.getByTestId("sent").element().textContent).toContain("Added Context"),
    );
    const sent = screen.getByTestId("sent").element().textContent;
    expect(sent).toContain("not written yet");
    expect(sent).toContain("t3_work_item_get");
    expect(sent).not.toContain("never inlined");
  });
});
