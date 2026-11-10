import { describe, expect, it, vi } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";

import {
  dispatchWelcomeAccountAction,
  dispatchWelcomeAgentAction,
} from "./t3team-welcomeActionDispatch";

describe("dispatchWelcomeAgentAction", () => {
  it("routes Claude/Codex install and sign-in to ToolAuth handlers", () => {
    const onInstall = vi.fn();
    const onSignIn = vi.fn();
    const onOpenProviderSetup = vi.fn();
    const handlers = { onInstall, onSignIn, onOpenProviderSetup };

    dispatchWelcomeAgentAction({ kind: "toolAuthInstall", tool: "claude" }, handlers)?.run();
    dispatchWelcomeAgentAction({ kind: "toolAuthSignIn", tool: "codex" }, handlers)?.run();
    expect(onInstall).toHaveBeenCalledWith("claude");
    expect(onSignIn).toHaveBeenCalledWith("codex");
  });

  it("routes Cursor/other setup through openProviderSetup", () => {
    const onOpenProviderSetup = vi.fn();
    const instanceId = ProviderInstanceId.make("cursor-1");
    dispatchWelcomeAgentAction(
      { kind: "openProviderSetup", instanceId },
      { onInstall: vi.fn(), onSignIn: vi.fn(), onOpenProviderSetup },
    )?.run();
    expect(onOpenProviderSetup).toHaveBeenCalledWith(instanceId);
  });

  it("returns null for ready/disabled rows with no button", () => {
    expect(
      dispatchWelcomeAgentAction(
        { kind: "none" },
        { onInstall: vi.fn(), onSignIn: vi.fn(), onOpenProviderSetup: vi.fn() },
      ),
    ).toBeNull();
    expect(
      dispatchWelcomeAgentAction(
        { kind: "disabled", reason: "unavailable" },
        { onInstall: vi.fn(), onSignIn: vi.fn(), onOpenProviderSetup: vi.fn() },
      ),
    ).toBeNull();
  });
});

describe("dispatchWelcomeAccountAction", () => {
  it("fires Sign in, Skip, Copy code & open, and Retry handlers", () => {
    const handlers = {
      onSignIn: vi.fn(),
      onSkip: vi.fn(),
      onOpenVerification: vi.fn(),
      onRetry: vi.fn(),
    };
    dispatchWelcomeAccountAction({ kind: "signIn" }, handlers);
    dispatchWelcomeAccountAction({ kind: "skip" }, handlers);
    dispatchWelcomeAccountAction({ kind: "copyAndOpen" }, handlers);
    dispatchWelcomeAccountAction({ kind: "retry" }, handlers);
    expect(handlers.onSignIn).toHaveBeenCalledTimes(1);
    expect(handlers.onSkip).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenVerification).toHaveBeenCalledTimes(1);
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });
});
