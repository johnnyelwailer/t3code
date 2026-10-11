/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const environmentPhase = vi.hoisted(() => ({ value: "connected" }));
const preparedConnection = vi.hoisted(() => ({
  value: null as null | { environmentId: string; httpBaseUrl: string },
}));
const environmentPost = vi.hoisted(() => ({
  calls: [] as Array<{ prepared: unknown; path: string; body: unknown }>,
  reply: { status: 200, payload: { ok: true } as unknown },
}));

vi.mock("~/state/environments", () => ({
  useEnvironment: () => ({ connection: { phase: environmentPhase.value } }),
}));
vi.mock("~/state/session", () => ({
  readPreparedConnection: () => preparedConnection.value,
}));
vi.mock("~/t3team/chat/t3team-useThreadOutboxDock", () => ({
  useT3TeamThreadOutboxDock: () => undefined,
}));
// The environment request itself (bearer or DPoP signing) is covered in client-runtime
// (`t3team-environmentJsonPost.test.ts`); here the runtime command is replaced by a recorder.
vi.mock("~/connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("@t3tools/client-runtime/state/runtime", () => ({
  createRuntimeCommand: (_runtime: unknown, options: { execute: (input: never) => unknown }) => ({
    run: async (_registry: unknown, input: { prepared: unknown; path: string; body: unknown }) => {
      environmentPost.calls.push(input);
      return { _tag: "Success", value: environmentPost.reply };
    },
    options,
  }),
  runAtomCommand: (
    registry: unknown,
    command: { run: (registry: unknown, input: unknown) => unknown },
    input: unknown,
  ) => command.run(registry, input),
  squashAtomCommandFailure: (result: { cause: unknown }) => result.cause,
}));

import {
  getT3TeamOutboxSnapshot,
  resetT3TeamOutboxStoreForTests,
} from "~/t3team/outbox/t3team-outboxStore";
import { useT3TeamEnvironmentThreadExtension } from "./t3team-useEnvironmentThreadExtension";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RELAY_ENVIRONMENT = "relay-env" as EnvironmentId;
const DECISION = {
  threadId: "thread-1",
  messageId: "reply-1",
  text: "Open it",
  value: true,
  correlationId: "ask-1",
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function expectQueuedAnswer() {
  expect(getT3TeamOutboxSnapshot().entries).toMatchObject([
    {
      kind: "workflow-answer",
      environmentId: RELAY_ENVIRONMENT,
      threadId: "thread-1",
      payload: { messageId: "reply-1", value: true, correlationId: "ask-1" },
    },
  ]);
}

async function mountExtension() {
  const latest: { extension: ReturnType<typeof useT3TeamEnvironmentThreadExtension> | null } = {
    extension: null,
  };
  function Harness() {
    latest.extension = useT3TeamEnvironmentThreadExtension(RELAY_ENVIRONMENT, "thread-1");
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Harness />);
  });
  return latest;
}

beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, String(v)),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size;
    },
  });
  resetT3TeamOutboxStoreForTests();
  environmentPhase.value = "connected";
  preparedConnection.value = { environmentId: "relay-env", httpBaseUrl: "http://127.0.0.1:50123/" };
  environmentPost.calls = [];
  environmentPost.reply = { status: 200, payload: { ok: true } };
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe("useT3TeamEnvironmentThreadExtension", () => {
  it("answers a decision card on the thread's own environment", async () => {
    const latest = await mountExtension();

    await latest.extension?.dispatchWorkflowDecision?.(DECISION);

    expect(environmentPost.calls).toEqual([
      {
        prepared: preparedConnection.value,
        path: "/api/t3team/thread/workflow/resolve-input",
        body: {
          threadId: "thread-1",
          text: "Open it",
          messageId: "reply-1",
          value: true,
          correlationId: "ask-1",
        },
      },
    ]);
  });

  it("rejects with the server's own reason when it refuses the answer", async () => {
    environmentPost.reply = {
      status: 400,
      payload: { error: "This decision is no longer pending — the workflow has moved on." },
    };
    const latest = await mountExtension();

    await expect(latest.extension?.dispatchWorkflowDecision?.(DECISION)).rejects.toThrow(
      "This decision is no longer pending",
    );
  });

  it("queues the answer instead of sending while the environment is not connected", async () => {
    environmentPhase.value = "backoff";
    const latest = await mountExtension();

    await latest.extension?.dispatchWorkflowDecision?.(DECISION);

    expect(environmentPost.calls).toEqual([]);
    expectQueuedAnswer();
  });

  it("queues the answer when the environment reads as connected but its connection is not ready", async () => {
    preparedConnection.value = null;
    const latest = await mountExtension();

    await latest.extension?.dispatchWorkflowDecision?.(DECISION);

    expect(environmentPost.calls).toEqual([]);
    expectQueuedAnswer();
  });

  it("controls a run on the thread's own environment", async () => {
    environmentPost.reply = { status: 200, payload: { ok: true, status: "paused" } };
    const latest = await mountExtension();

    await expect(
      latest.extension?.onControlWorkflow?.({ workflowRunId: "run-1", action: "pause" }),
    ).resolves.toMatchObject({ status: "paused" });

    expect(environmentPost.calls).toMatchObject([
      {
        path: "/api/t3team/thread/workflow/control",
        body: { threadId: "thread-1", workflowRunId: "run-1", action: "pause" },
      },
    ]);
  });
});
