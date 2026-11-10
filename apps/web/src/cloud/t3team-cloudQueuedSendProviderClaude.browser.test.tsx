/**
 * Selecting Claude on a cloud session auto-installs, shows the inline sign-in card, raises zero
 * error toasts, then the flush becomes dispatch once the provider is ready.
 */
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProjectId,
  type ServerProvider,
  type ToolAuthState,
} from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { decideCloudQueuedSendFlush } from "./t3team-cloudQueuedSendFlush";
import { decodeCloudQueuedSend } from "./t3team-cloudQueuedSendModel";
import { CloudQueuedSendProviderEnsure } from "./t3team-CloudQueuedSendProviderEnsure";
import {
  resetCloudQueuedSendProviderReadyStore,
  setCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";
import { CloudSessionSetupCard } from "./t3team-CloudSessionSetupCard";

const harness = vi.hoisted(() => {
  const toastAdd = vi.fn();
  const install = vi.fn(async () => ({ _tag: "Success" as const, value: undefined }));
  const start = vi.fn(async () => ({ _tag: "Success" as const, value: undefined }));
  type Listener = () => void;
  const listeners = new Set<Listener>();
  const state = {
    current: new Map<string, ToolAuthState>(),
    install,
    start,
    toastAdd,
  };
  return {
    state,
    listeners,
    set(next: Map<string, ToolAuthState>) {
      state.current = next;
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("~/components/ui/toast", () => ({
  toastManager: { add: harness.state.toastAdd },
  stackedThreadToast: (input: unknown) => input,
}));
vi.mock("~/state/t3team-toolauth", () => ({
  toolAuthEnvironment: { install: "install", start: "start" },
  useToolAuthStates: () =>
    useSyncExternalStore(
      (listener) => {
        harness.listeners.add(listener);
        return () => harness.listeners.delete(listener);
      },
      () => harness.state.current,
    ),
  useToolAuthActions: () => ({
    onConnect: () => {},
    onInstall: () => {},
    onSubmitCode: () => {},
    onCancel: () => {},
  }),
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) =>
    command === "install" ? harness.state.install : harness.state.start,
}));
vi.mock("~/state/environments", () => ({
  useEnvironmentProviders: () =>
    new Map([
      [
        EnvironmentId.make("env-cloud"),
        [
          {
            instanceId: ProviderInstanceId.make("claudeAgent"),
            driver: ProviderDriverKind.make("claudeAgent"),
            displayName: "Claude",
            enabled: true,
            installed: false,
            version: null,
            status: "error",
            auth: { status: "unknown" },
            checkedAt: "2026-01-01T00:00:00.000Z",
            models: [],
            slashCommands: [],
            skills: [],
          } satisfies ServerProvider,
        ],
      ],
    ]),
  usePrimaryEnvironmentId: () => EnvironmentId.make("env-primary"),
}));
vi.mock("./t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
}));

const noRouter: { readonly router: false } = { router: false };
const cloud = EnvironmentId.make("env-cloud");
const queued = decodeCloudQueuedSend({
  messageId: "msg-claude",
  messageText: "hello claude",
  outgoingText: "hello claude",
  titleSeed: "hello claude",
  modelSelection: { instanceId: "claudeAgent", model: "claude-sonnet-4" },
  runtimeMode: "full-access",
  interactionMode: "default",
  sessionId: "session-cloud",
  sessionLabel: "cloud",
  createdAt: "2026-11-10T17:00:00.000Z",
})!;

function phase(next: Partial<ToolAuthState> & Pick<ToolAuthState, "phase">) {
  return act(async () => {
    harness.set(new Map([["claude", { tool: "claude", ...next }]]));
  });
}

describe("cloud Claude provider gate", () => {
  it("installs, shows the sign-in card, raises no error toasts, then dispatches when ready", async () => {
    harness.state.toastAdd.mockReset();
    harness.state.install.mockClear();
    harness.state.start.mockClear();
    harness.set(new Map());
    resetCloudQueuedSendProviderReadyStore();

    await using screen = await render(
      <>
        <CloudQueuedSendProviderEnsure queued={queued} environmentId={cloud} projectReady={true} />
        <CloudSessionSetupCard
          facts={{
            session: {
              sessionId: "session-cloud",
              providerKind: "github_actions",
              phase: "ready",
              environmentId: cloud,
              elapsedSeconds: 10,
              remainingSeconds: null,
              machineLabel: "ubuntu",
              failureReason: null,
              detailsUrl: null,
            },
            machineConnected: true,
            projectReady: true,
            providerReady: false,
            queued,
            delivery: "queued",
          }}
          frozenElapsedSeconds={10}
        />
      </>,
      noRouter,
    );

    await vi.waitFor(() => expect(harness.state.install).toHaveBeenCalledTimes(1));
    expect(harness.state.toastAdd).not.toHaveBeenCalled();
    expect(
      decideCloudQueuedSendFlush({
        queued,
        target: null,
        session: {
          sessionId: "session-cloud",
          phase: "ready",
          environmentId: cloud,
        } as never,
        connectFailure: null,
        machineConnected: true,
        projectId: ProjectId.make("project-1"),
        scratch: false,
        threadExists: false,
        providerReady: false,
      }).kind,
    ).toBe("wait");

    await phase({
      phase: "awaiting-open",
      url: "https://claude.ai/login",
      displayCode: "CLAUDE-42",
    });
    await expect.element(screen.getByText("CLAUDE-42")).toBeInTheDocument();
    expect(
      screen.container.querySelector("[data-cloud-setup-provider-auth='claude']"),
    ).not.toBeNull();
    expect(harness.state.toastAdd).not.toHaveBeenCalled();

    act(() => {
      setCloudQueuedSendProviderReady(queued.messageId, { kind: "ready" });
    });
    expect(
      decideCloudQueuedSendFlush({
        queued,
        target: null,
        session: {
          sessionId: "session-cloud",
          phase: "ready",
          environmentId: cloud,
        } as never,
        connectFailure: null,
        machineConnected: true,
        projectId: ProjectId.make("project-1"),
        scratch: false,
        threadExists: false,
        providerReady: true,
      }),
    ).toEqual({
      kind: "dispatch",
      environmentId: cloud,
      projectId: ProjectId.make("project-1"),
    });
    expect(harness.state.toastAdd.mock.calls.filter((call) => call[0]?.type === "error")).toEqual(
      [],
    );
  });
});
