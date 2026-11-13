// @vitest-environment jsdom
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { Profiler, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { renderCounter } from "~/test/t3team-renderCounter";

import { CloudSessionSetupProviderAuth } from "./t3team-CloudSessionSetupProviderAuth";
import type { CloudQueuedSendProviderGate } from "./t3team-cloudQueuedSendProviderGate";
import {
  resetCloudQueuedSendProviderReadyStore,
  setCloudQueuedSendProviderReady,
} from "./t3team-cloudQueuedSendProviderReadyStore";

vi.mock("~/state/environments", () => ({
  useEnvironmentProviders: () => new Map([[cloudEnv, [claudeProvider]]]),
}));
vi.mock("~/state/t3team-toolauth", () => ({
  useToolAuthStates: () => new Map(),
  useToolAuthActions: () => ({
    onConnect: () => {},
    onInstall: () => {},
    onSubmitCode: () => {},
    onCancel: () => {},
  }),
}));
vi.mock("~/t3team/t3team-useToolAuthEnvironmentFlag", () => ({
  useToolAuthEnvironmentAvailability: () => "enabled",
}));
vi.mock("./t3team-cloudMachineSignIn", () => ({
  useSignInDescriptionForEnvironment: () => null,
  useToolAuthMachineLabel: () => "this cloud machine",
}));

/**
 * Every card subscribes to the same global provider-gate store, so a gate update for another
 * message must not re-render this card: only the card whose own gate (the auth state it shows)
 * changed may re-render. Counts come from a Profiler around each card, via renderCounter.
 */
const cloudEnv = EnvironmentId.make("env-cloud");
const claudeProvider: ServerProvider = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude",
  enabled: true,
  installed: true,
  version: null,
  status: "warning",
  auth: { status: "unauthenticated" },
  checkedAt: "2026-01-01T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};

const counter = renderCounter();
function CountingAuth(props: {
  readonly messageId: string;
  readonly environmentId: EnvironmentId;
  readonly instanceId: string;
}) {
  return (
    <Profiler
      id={props.messageId}
      onRender={(id) => {
        counter.count(id);
      }}
    >
      <CloudSessionSetupProviderAuth {...props} />
    </Profiler>
  );
}

const needsAuth: CloudQueuedSendProviderGate = { kind: "needsAuth", tool: "claude" };
const needsInstall: CloudQueuedSendProviderGate = { kind: "needsInstall", tool: "claude" };

function Harness() {
  return (
    <div>
      <CountingAuth messageId="msg-1" environmentId={cloudEnv} instanceId="claudeAgent" />
      <CountingAuth messageId="msg-2" environmentId={cloudEnv} instanceId="claudeAgent" />
    </div>
  );
}

describe("CloudSessionSetupProviderAuth re-renders", () => {
  let container: HTMLElement;
  let root: Root;

  function seed() {
    resetCloudQueuedSendProviderReadyStore();
    setCloudQueuedSendProviderReady("msg-1", needsAuth);
    setCloudQueuedSendProviderReady("msg-2", needsAuth);
  }

  function mount() {
    return act(async () => {
      root.render(<Harness />);
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    counter.reset();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    counter.reset();
    resetCloudQueuedSendProviderReadyStore();
  });

  it("mounts each card exactly once", async () => {
    seed();
    await mount();
    expect(container.querySelectorAll('[data-cloud-setup-provider-auth="claude"]')).toHaveLength(2);
    counter.expectRerendered({ "msg-1": 1, "msg-2": 1 });
  });

  it("sits out another message's gate update", async () => {
    seed();
    await mount();
    counter.reset();
    // One store update can show up as more than one update pass on the affected card (React's
    // tearing check), so the budget is which card re-renders, not how many passes it takes.
    await act(async () => {
      setCloudQueuedSendProviderReady("msg-2", needsInstall);
    });
    expect(counter.rerendered()).toEqual(["msg-2"]);
    expect(container.querySelectorAll('[data-cloud-setup-provider-auth="claude"]')).toHaveLength(2);
  });

  it("re-renders when its own gate (auth state) changes, the sibling sits out", async () => {
    seed();
    await mount();
    counter.reset();
    await act(async () => {
      setCloudQueuedSendProviderReady("msg-1", needsInstall);
    });
    expect(counter.rerendered()).toEqual(["msg-1"]);
  });
});
