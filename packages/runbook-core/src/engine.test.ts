import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createWorkflowEngine } from "./engine.ts";
import type { WorkflowReference } from "./engine.ts";
import { createStoreSink, FsJournalStore } from "./journalStore.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

describe("@runbook/core lifecycle engine", () => {
  it("keeps start, resume, overwrite, and input-drift semantics in the generic layer", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-engine-"));
    roots.push(runsRoot);
    const ref: WorkflowReference = { absolutePath: "/workflows/review.workflow.ts" };
    const engine = createWorkflowEngine<WorkflowReference, { runsRoot?: string }>({
      defaultRunsRoot: () => runsRoot,
      createStore: (root) => new FsJournalStore(root),
      newRunId: () => "generated-run",
      nowIso: () => "2026-08-02T00:00:00.000Z",
      executeRun: async ({ runId, store, args }) => {
        const sink = createStoreSink(store, runId);
        sink.append({
          seq: 1,
          callId: "1:test:execute",
          kind: "test.execute",
          refId: "execute",
          argsHash: JSON.stringify(args),
          result: { ok: true },
          startedAt: "2026-08-02T00:00:00.000Z",
          endedAt: "2026-08-02T00:00:00.000Z",
        });
        await sink.flush();
        sink.dispose();
        return { kind: "completed", output: { ok: true } } as const;
      },
    });

    expect(
      await engine.startWorkflow(ref, { ticket: "JIRA-1" }, { runsRoot, runId: "run-1" }),
    ).toEqual({ runId: "run-1", result: { ok: true } });
    await expect(
      engine.startWorkflow(ref, { ticket: "JIRA-1" }, { runsRoot, runId: "run-1" }),
    ).rejects.toThrow("resumeWorkflow");
    expect(
      await engine.startWorkflow(
        ref,
        { ticket: "JIRA-2" },
        { runsRoot, runId: "run-1", overwrite: true },
      ),
    ).toEqual({ runId: "run-1", result: { ok: true } });
    await expect(
      engine.resumeWorkflow("run-1", ref, { ticket: "JIRA-3" }, { runsRoot }),
    ).rejects.toThrow("replay drift");
    await expect(engine.resumeWorkflow("missing", ref, {}, { runsRoot })).rejects.toThrow(
      "No workflow journal found",
    );
  });
});
