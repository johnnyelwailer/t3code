// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ChatComposerHandle } from "~/components/chat/ChatComposer";
import { ComposerHandleContext, useComposerHandleContext } from "~/composerHandleContext";

// ChatComposer binds its handle into the context ref; the stub does the same with a marker.
vi.mock("~/components/ChatView", () => ({
  default: (props: { threadId: string }) => {
    const handleRef = useComposerHandleContext();
    if (handleRef) handleRef.current = { threadId: props.threadId } as never;
    return null;
  },
}));
vi.mock("~/t3team/chat/t3team-ThreadComposerAccessory", () => ({
  T3TeamThreadComposerAccessory: () => null,
}));
vi.mock("~/t3team/outbox/t3team-outboxStore", () => ({
  useT3TeamOutboxStore: () => ({ entries: [], dispatchingEntryId: null, failures: {} }),
}));
vi.mock("~/t3team/outbox/t3team-useOutboxDrain", () => ({ useT3TeamOutboxDrain: () => {} }));
vi.mock("~/t3team/outbox/t3team-outboxTimelineRows", () => ({
  t3TeamOutboxTimelineExtensions: () => [],
}));

import { ThreadChatViewBody, type ThreadChatViewBodyProps } from "./t3team-ThreadChatViewBody";

function body(
  threadId: string,
  embeddedMode: boolean,
  overrides: Partial<ThreadChatViewBodyProps> = {},
) {
  const props: ThreadChatViewBodyProps = {
    environmentId: "env-1" as EnvironmentId,
    threadId,
    projectId: "project-1",
    hasServerThread: true,
    showKickoffPlaceholder: false,
    kickoffMessage: undefined,
    kickoffPending: undefined,
    kickoffWorkflow: undefined,
    kickoffHistoryMessage: undefined,
    onBack: undefined,
    titleBarControlsAccessory: undefined,
    hideHeader: embeddedMode,
    embeddedMode,
    backend: null,
    bootstrapStatus: "ready" as never,
    retryThreadBootstrap: () => {},
    composerState: {
      composerDropTarget: { composerContainerProps: {}, composerContainerOverlay: null },
      contextAttachments: [],
    } as never,
    ...overrides,
  };
  return <ThreadChatViewBody key={threadId} {...props} />;
}

describe("ThreadChatViewBody composer handle scope", () => {
  it("keeps the app-wide composer handle on the primary thread when an embedded peer mounts after it", () => {
    // The primary thread's sends read their model from this handle. A peer thread opened in the
    // right panel on another provider used to take it over, so the primary sent with the peer's
    // provider and the server rejected the driver switch.
    const appHandleRef = { current: null as ChatComposerHandle | null };
    renderToStaticMarkup(
      <ComposerHandleContext value={appHandleRef}>
        {body("primary-thread", false)}
        {body("embedded-child-thread", true)}
      </ComposerHandleContext>,
    );

    expect(appHandleRef.current).toEqual({ threadId: "primary-thread" });
  });

  it("shows creating progress before the server shell exists", () => {
    const markup = renderToStaticMarkup(
      body("local-thread", true, {
        hasServerThread: false,
        bootstrapStatus: "running",
        kickoffMessage: "Investigate the regression",
        showKickoffPlaceholder: true,
      }),
    );

    expect(markup).toContain("Creating thread...");
    expect(markup).toContain("Creating the conversation on the server.");
  });

  it("shows launch interrupted inside the open chat after the shell exists", () => {
    const markup = renderToStaticMarkup(
      body("local-thread", true, {
        hasServerThread: true,
        bootstrapStatus: "failed",
      }),
    );

    expect(markup).toContain("Launch interrupted");
    expect(markup).toContain("Retry launch");
  });
});
