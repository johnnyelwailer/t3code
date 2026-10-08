import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { OrchestrationV2AppThreadJson } from "./index.ts";

const decode = Schema.decodeUnknownSync(OrchestrationV2AppThreadJson);
const encode = Schema.encodeSync(OrchestrationV2AppThreadJson);

const thread = {
  createdBy: "user",
  creationSource: "web",
  id: "thread-1",
  projectId: "project-1",
  title: "Thread",
  providerInstanceId: "codex",
  modelSelection: { instanceId: "codex", model: "gpt-5-codex" },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: null,
  worktreePath: null,
  activeProviderThreadId: null,
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: "thread-1" },
  forkedFrom: null,
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  archivedAt: null,
  deletedAt: null,
};

describe("thread pendingWorkflowAsk mirror", () => {
  it("decodes threads written before the mirror existed", () => {
    expect(decode(thread).pendingWorkflowAsk).toBeUndefined();
  });

  it("round-trips a set and a cleared mirror through the persisted thread JSON", () => {
    const ask = { runId: "run-1", correlationId: "ask-1", createdAt: "2026-10-08T10:01:00.000Z" };
    const set = decode({ ...thread, pendingWorkflowAsk: ask });
    expect(set.pendingWorkflowAsk).toEqual(ask);
    expect(decode(encode(set)).pendingWorkflowAsk).toEqual(ask);
    expect(decode({ ...thread, pendingWorkflowAsk: null }).pendingWorkflowAsk).toBeNull();
  });

  it("rejects a mirror without a correlation id", () => {
    expect(() =>
      decode({
        ...thread,
        pendingWorkflowAsk: { runId: "run-1", correlationId: " ", createdAt: thread.createdAt },
      }),
    ).toThrow();
  });
});
