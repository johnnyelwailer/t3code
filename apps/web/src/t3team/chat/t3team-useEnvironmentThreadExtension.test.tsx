/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EnvironmentId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const environmentPhase = vi.hoisted(() => ({ value: "connected" }));
const preparedConnection = vi.hoisted(() => ({
  value: null as null | {
    httpBaseUrl: string;
    httpAuthorization: { _tag: "Bearer"; token: string } | null;
  },
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
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

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
  preparedConnection.value = {
    httpBaseUrl: "http://127.0.0.1:50123/",
    httpAuthorization: { _tag: "Bearer", token: "session-bearer" },
  };
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

describe("useT3TeamEnvironmentThreadExtension", () => {
  it("answers a decision card on the thread's own environment, with that connection's bearer", async () => {
    const latest = await mountExtension();

    await latest.extension?.dispatchWorkflowDecision?.(DECISION);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:50123/api/t3team/thread/workflow/resolve-input");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      headers: { authorization: "Bearer session-bearer" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      threadId: "thread-1",
      text: "Open it",
      messageId: "reply-1",
      value: true,
      correlationId: "ask-1",
    });
  });

  it("queues the answer instead of sending while the environment is not connected", async () => {
    environmentPhase.value = "backoff";
    const latest = await mountExtension();

    await latest.extension?.dispatchWorkflowDecision?.(DECISION);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getT3TeamOutboxSnapshot().entries).toMatchObject([
      {
        kind: "workflow-answer",
        environmentId: RELAY_ENVIRONMENT,
        threadId: "thread-1",
        payload: { messageId: "reply-1", value: true, correlationId: "ask-1" },
      },
    ]);
  });

  it("rejects instead of sending unauthenticated when the connection uses a DPoP credential", async () => {
    preparedConnection.value = {
      httpBaseUrl: "https://relay.example/",
      httpAuthorization: { _tag: "Dpop", accessToken: "t", expiresAtEpochMs: 1 } as never,
    };
    const latest = await mountExtension();

    await expect(latest.extension?.dispatchWorkflowDecision?.(DECISION)).rejects.toThrow(
      /relay sign-in/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("controls a run on the thread's own environment", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: "paused" }),
    } as Response);
    const latest = await mountExtension();

    await expect(
      latest.extension?.onControlWorkflow?.({ workflowRunId: "run-1", action: "pause" }),
    ).resolves.toMatchObject({ status: "paused" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:50123/api/t3team/thread/workflow/control");
    expect(JSON.parse(String(init?.body))).toEqual({
      threadId: "thread-1",
      workflowRunId: "run-1",
      action: "pause",
    });
  });
});
