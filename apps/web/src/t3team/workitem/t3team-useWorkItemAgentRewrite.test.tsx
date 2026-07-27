/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { TicketKickoffThreadInput } from "~/t3team/t3team-kickoffTypes";
import {
  useWorkItemAgentRewrite,
  type UseWorkItemAgentRewriteInput,
} from "./t3team-useWorkItemAgentRewrite";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Result = ReturnType<typeof useWorkItemAgentRewrite>;

function mount(initialProps: UseWorkItemAgentRewriteInput): {
  readonly latest: { result: Result | null };
  readonly rerender: (nextProps: UseWorkItemAgentRewriteInput) => Promise<void>;
  readonly unmount: () => Promise<void>;
} {
  const latest: { result: Result | null } = { result: null };
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);

  function Harness(props: UseWorkItemAgentRewriteInput) {
    latest.result = useWorkItemAgentRewrite(props);
    return null;
  }

  const rerender = async (nextProps: UseWorkItemAgentRewriteInput) => {
    await act(async () => {
      root.render(<Harness {...nextProps} />);
    });
  };

  return {
    latest,
    rerender,
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

/** Flushes both the microtask queue (promise chains) and a macrotask tick, for fire-and-forget
 * async work started from an event handler rather than awaited directly. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function baseProps(overrides?: Partial<UseWorkItemAgentRewriteInput>): UseWorkItemAgentRewriteInput {
  return {
    backend: {} as BackendApi,
    projectId: "proj-1",
    ticketId: "ticket-1",
    issueIdOrKey: "PROJ-42",
    ticketDisplayId: "PROJ-42",
    descriptionText: "Current text.",
    githubActivityItems: [],
    hasPendingDescriptionDraft: false,
    onKickoffThread: () => {},
    ...overrides,
  };
}

describe("useWorkItemAgentRewrite", () => {
  let harness: ReturnType<typeof mount> | null = null;

  afterEach(async () => {
    await harness?.unmount();
    harness = null;
  });

  it("starts a turn on the active thread with the built prompt", async () => {
    const dispatchCommand = vi.fn().mockResolvedValue(undefined);
    const backend = { dispatchCommand } as unknown as BackendApi;
    harness = mount(baseProps({ backend, activeThreadId: "thread-1" }));
    await harness.rerender(baseProps({ backend, activeThreadId: "thread-1" }));

    await act(async () => {
      harness!.latest.result?.start();
      await flush();
    });

    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    const command = dispatchCommand.mock.calls[0]?.[0] as {
      type: string;
      threadId: string;
      message: { text: string };
    };
    expect(command.type).toBe("thread.turn.start");
    expect(command.threadId).toBe("thread-1");
    expect(command.message.text).toContain("PROJ-42");
    expect(command.message.text).toContain("t3team.work_item.description.draft_update");
    expect(harness!.latest.result?.isStarting).toBe(false);
  });

  it("kicks off a new ticket thread with the prompt as the kickoff message when there is no active thread", async () => {
    const onKickoffThread = vi.fn<(input: TicketKickoffThreadInput) => void>();
    harness = mount(baseProps({ onKickoffThread }));
    await harness.rerender(baseProps({ onKickoffThread }));

    act(() => {
      harness!.latest.result?.start();
    });

    expect(onKickoffThread).toHaveBeenCalledTimes(1);
    const input = onKickoffThread.mock.calls[0]?.[0];
    expect(input?.projectId).toBe("proj-1");
    expect(input?.ticketId).toBe("ticket-1");
    expect(input?.ticketDisplayId).toBe("PROJ-42");
    expect(input?.kickoffMessage).toContain("PROJ-42");
    expect(input?.kickoffMessage).toContain("t3team.work_item.description.draft_update");
  });

  it("surfaces an error and clears isStarting when sendT3TeamThreadTurn rejects", async () => {
    const dispatchCommand = vi.fn().mockRejectedValue(new Error("Thread already has a turn in progress."));
    const backend = { dispatchCommand } as unknown as BackendApi;
    harness = mount(baseProps({ backend, activeThreadId: "thread-1" }));
    await harness.rerender(baseProps({ backend, activeThreadId: "thread-1" }));

    await act(async () => {
      harness!.latest.result?.start();
      await flush();
    });

    expect(harness!.latest.result?.isStarting).toBe(false);
    expect(harness!.latest.result?.error).not.toBeNull();
    expect(harness!.latest.result?.error?.headline).toContain("finishing a turn");
  });
});
