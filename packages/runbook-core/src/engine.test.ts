import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createWorkflowEngine } from "./engine.ts";
import type { WorkflowReference, WorkflowVersionPolicy } from "./engine.ts";
import { ReplayDriftError } from "./errors.ts";
import { FsJournalStore } from "./journalStore.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

describe("@runbook/core lifecycle engine", () => {
  it("keeps start, resume, overwrite, and input-drift semantics in the generic layer", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-engine-"));
    roots.push(runsRoot);
    const ref: WorkflowReference = { path: "review.workflow.ts" };
    const engine = createWorkflowEngine<
      WorkflowReference,
      { runsRoot?: string; workflowVersionPolicy?: WorkflowVersionPolicy }
    >({
      workflowPath: (workflowRef) => workflowRef.path,
      defaultRunsRoot: () => runsRoot,
      createStore: (root) => new FsJournalStore(root),
      newRunId: () => "generated-run",
      nowIso: () => "2026-08-02T00:00:00.000Z",
      executeBody: async ({ sink, args }) => {
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
        return { ok: true };
      },
    });

    expect(
      await engine.startWorkflow(ref, { ticket: "T-1" }, { runsRoot, runId: "run-1" }),
    ).toEqual({ runId: "run-1", result: { ok: true } });
    await expect(
      engine.startWorkflow(ref, { ticket: "T-1" }, { runsRoot, runId: "run-1" }),
    ).rejects.toThrow("resumeWorkflow");
    expect(
      await engine.startWorkflow(
        ref,
        { ticket: "T-2" },
        { runsRoot, runId: "run-1", overwrite: true },
      ),
    ).toEqual({ runId: "run-1", result: { ok: true } });
    await expect(
      engine.resumeWorkflow("run-1", ref, { ticket: "T-3" }, { runsRoot }),
    ).rejects.toThrow("replay drift");
    await expect(engine.resumeWorkflow("missing", ref, {}, { runsRoot })).rejects.toThrow(
      "No workflow journal found",
    );
  });

  it("rejects a changed executable version before replaying a run", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-engine-version-"));
    roots.push(runsRoot);
    let version = "v1";
    const ref: WorkflowReference = { path: "review.workflow.ts" };
    const engine = createWorkflowEngine<
      WorkflowReference,
      { runsRoot?: string; workflowVersionPolicy?: WorkflowVersionPolicy }
    >({
      workflowPath: (workflowRef) => workflowRef.path,
      defaultRunsRoot: () => runsRoot,
      createStore: (root) => new FsJournalStore(root),
      newRunId: () => "versioned-run",
      nowIso: () => "2026-08-02T00:00:00.000Z",
      workflowVersion: () => version,
      executeBody: async () => ({ ok: true }),
    });

    await engine.startWorkflow(ref, {}, { runsRoot });
    const meta = await new FsJournalStore(runsRoot).readRunMeta("versioned-run");
    expect(meta?.workflowVersion).toBe("v1");
    version = "v2";

    const error = await engine
      .resumeWorkflow("versioned-run", ref, {}, { runsRoot })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ReplayDriftError);
    expect((error as ReplayDriftError).reason).toBe("workflow");
    expect((error as ReplayDriftError).seq).toBe(0);
  });

  it("persists an explicitly accepted executable replacement as the new replay baseline", async () => {
    const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "runbook-engine-version-"));
    roots.push(runsRoot);
    let version = "v1";
    const ref: WorkflowReference = { path: "review.workflow.ts" };
    const engine = createWorkflowEngine<
      WorkflowReference,
      { runsRoot?: string; workflowVersionPolicy?: WorkflowVersionPolicy }
    >({
      workflowPath: (workflowRef) => workflowRef.path,
      defaultRunsRoot: () => runsRoot,
      createStore: (root) => new FsJournalStore(root),
      newRunId: () => "accepted-version-run",
      nowIso: () => "2026-08-02T00:00:00.000Z",
      workflowVersion: () => version,
      executeBody: async () => ({ ok: true }),
    });

    await engine.startWorkflow(ref, {}, { runsRoot });
    version = "v2";
    await expect(
      engine.resumeWorkflow(
        "accepted-version-run",
        ref,
        {},
        {
          runsRoot,
          workflowVersionPolicy: "allow-change",
        },
      ),
    ).resolves.toEqual({ runId: "accepted-version-run", result: { ok: true } });
    const meta = await new FsJournalStore(runsRoot).readRunMeta("accepted-version-run");
    expect(meta?.workflowVersion).toBe("v2");
  });
});
