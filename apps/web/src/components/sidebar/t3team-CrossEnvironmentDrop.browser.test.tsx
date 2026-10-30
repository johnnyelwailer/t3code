import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { postToEnvironment } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import { useT3TeamThreadContextQueue } from "~/t3team/chat/t3team-useThreadContextQueue";
import { buildAddToChatAgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import type { AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import { useT3TeamAddToChatStore } from "~/t3team/t3team-addToChatStore";
import {
  FIXTURE_ENVIRONMENT_ID,
  makeThreadRowProps,
  makeThreadShell,
  ThreadRowHarness,
} from "./t3team-SidebarThreadRow.fixture";

const REMOTE = EnvironmentId.make("environment-remote");
const REPOSITORY = {
  canonicalKey: "github.com/acme/app",
  locator: { source: "git-remote", remoteName: "origin", remoteUrl: "github.com/acme/app" },
};

vi.mock("~/state/entities", async (original) => ({
  ...(await original<typeof import("~/state/entities")>()),
  readThreadShell: () => ({ projectId: "remote-project", worktreePath: "/work/remote-thread" }),
  readProject: () => ({ workspaceRoot: "/work/remote-project" }),
  readProjects: () => [
    {
      environmentId: "environment-primary",
      id: "project-1",
      workspaceRoot: "/work/local",
      isScratch: false,
      source: null,
      repositoryIdentity: REPOSITORY,
    },
    {
      environmentId: "environment-remote",
      id: "remote-project",
      workspaceRoot: "/work/remote-project",
      isScratch: false,
      source: null,
      repositoryIdentity: REPOSITORY,
    },
  ],
}));
vi.mock("~/t3team/backend/t3team-environmentWorkflowBackend", () => ({
  postToEnvironment: vi.fn(async () => ({})),
}));

/** The dragged-from environment's read route, answered when the test says so. */
function slowRead() {
  let release!: (record: unknown) => void;
  const record = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  return { record, release };
}

function WorkItemSource(props: { request: AddToChatRequest }) {
  const dragProps = useT3TeamAgentContextDrag({
    label: props.request.targetLabel,
    capabilities: buildAddToChatAgentContextCapabilities(props.request, {
      tools: [{ id: "t3_work_item_get", label: "Read", arguments: { issueKey: "PROJ-9" } }],
    }),
  });
  return (
    <div {...dragProps} data-testid="work-item-source">
      PROJ-9
    </div>
  );
}

function ComposerQueue({ threadId }: { threadId: string }) {
  const queue = useT3TeamThreadContextQueue({ environmentId: REMOTE, threadId, enabled: true });
  const [sent, setSent] = useState("");
  return (
    <div>
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

function setup(threadId: string) {
  const read = slowRead();
  const request: AddToChatRequest = {
    projectId: "project-1",
    projectTitle: "Alpha",
    targetLabel: "PROJ-9 Prepare release checklist",
    targetType: "work-item",
    kind: "jira-work-item",
    payload: {},
    fullRecord: () => read.record,
  };
  const thread = makeThreadShell({
    id: ThreadId.make(threadId),
    environmentId: REMOTE,
    projectId: ProjectId.make("remote-project"),
  });
  const onThreadActivate = vi.fn();
  return {
    read,
    request,
    threadId,
    onThreadActivate,
    row: makeThreadRowProps({ thread, onThreadActivate }),
  };
}

function queued(threadId: string) {
  return useT3TeamAddToChatStore.getState().threadAttachmentsByThreadId[threadId] ?? [];
}

describe("a drop on a thread of another environment", () => {
  it("opens and sends while the full record is still being read, then writes it there", async () => {
    const { read, request, row, threadId, onThreadActivate } = setup("thread-slow-read");

    await using screen = await render(
      <ThreadRowHarness row={row} primaryEnvironmentId={FIXTURE_ENVIRONMENT_ID}>
        <WorkItemSource request={request} />
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );
    expect(onThreadActivate).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await vi.waitFor(() =>
      expect(screen.getByTestId("sent").element().textContent).toContain("not written yet"),
    );
    expect(postToEnvironment).not.toHaveBeenCalled();

    read.release({ item: { key: "PROJ-9" }, comments: [{ body: "full thread of comments" }] });

    await vi.waitFor(() => expect(postToEnvironment).toHaveBeenCalledOnce());
    const [environmentId, route, body] = vi.mocked(postToEnvironment).mock.calls[0]!;
    expect(environmentId).toBe(REMOTE);
    expect(route).toBe("/api/t3team/project/workspace/context-files");
    expect(JSON.stringify(body)).toContain("full thread of comments");
  });

  it("keeps the chip pending until the full record has been written", async () => {
    vi.mocked(postToEnvironment).mockClear();
    const { read, request, row, threadId } = setup("thread-pending-chip");

    await using screen = await render(
      <ThreadRowHarness row={row} primaryEnvironmentId={FIXTURE_ENVIRONMENT_ID}>
        <WorkItemSource request={request} />
        <ComposerQueue threadId={threadId} />
      </ThreadRowHarness>,
    );
    await userEvent.dragAndDrop(
      screen.getByTestId("work-item-source"),
      screen.getByTestId("sidebar-row-slim"),
    );
    expect(queued(threadId)[0]?.syncStatus).toBe("syncing");

    read.release({ item: { key: "PROJ-9" } });

    await vi.waitFor(() => expect(queued(threadId)[0]?.syncStatus).toBe("synced"));
    expect(queued(threadId)[0]?.contextText).toContain("Cached copy: .nexi/context/threads/");
  });
});
