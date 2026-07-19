/* oxlint-disable eslint/no-unused-vars -- test workflow sources run in the SDK VM. */
// @effect-diagnostics nodeBuiltinImport:off -- integration harness owns a temporary workflow tree.
// @effect-diagnostics globalTimers:off -- polling observes an async repair-child handoff.
// @effect-diagnostics cryptoRandomUUID:off -- test command ids only need uniqueness.
/**
 * Host-level self-heal acceptance. This drives the real workflow engine, repair-child registry,
 * source replacement seam, and replay journal without starting a provider process.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { type OrchestrationCommand, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-self-heal-"));
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const brokenSource = `
export const meta = { name: "self-heal", capabilities: ["user"] };
thread.notifyUser("The first completed step");
throw new Error("runtime workflow failure");
`;
const fixedSource = `
export const meta = { name: "self-heal", capabilities: ["user"] };
thread.notifyUser("The first completed step");
return { repaired: true };
`;

const waitForRepair = async (
  registry: ReturnType<typeof makeWorkflowEngineRegistry>,
  childId: string,
) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pending = registry.takePending(childId);
    if (pending !== undefined) return pending;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return undefined;
};

describe("workflow self-heal — real host integration", () => {
  it("uses host structured generation without creating a tool-capable repair thread", async () => {
    const runId = "structured-no-tools";
    const workflowPath = NodePath.join(root, runId, "workflow.ts");
    NodeFS.mkdirSync(NodePath.dirname(workflowPath), { recursive: true });
    NodeFS.writeFileSync(workflowPath, brokenSource);
    const registry = makeWorkflowEngineRegistry();
    const commands: OrchestrationCommand[] = [];
    const result = await launchWorkflowRecipe({
      runId,
      workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: "launch-thread",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("original"), "original-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        commands.push(command);
      },
      newId: () => crypto.randomUUID(),
      nowIso: () => "2026-07-19T00:00:00.000Z",
      repairIntent: { goal: "finish", expectedOutcome: "valid result", guardrails: [] },
      allowRepairThreadFallback: false,
      generateRepairStructured: async () => ({
        safeToResume: true,
        correctedWorkflow: fixedSource,
        summary: "fixed without tools",
      }),
      readWorkflowSource: async () => NodeFS.readFileSync(workflowPath, "utf8"),
      replaceWorkflowSource: async (source) => NodeFS.writeFileSync(workflowPath, source),
    });

    expect(result).toEqual({ runId, status: "completed" });
    expect(commands.some((command) => command.type === "thread.create")).toBe(false);
    expect(NodeFS.readFileSync(workflowPath, "utf8")).toBe(fixedSource);
  });

  it("settles an active repair immediately when the run is stopped", async () => {
    const runId = "stop-active-repair";
    const workflowPath = NodePath.join(root, runId, "workflow.ts");
    NodeFS.mkdirSync(NodePath.dirname(workflowPath), { recursive: true });
    NodeFS.writeFileSync(workflowPath, brokenSource);
    const registry = makeWorkflowEngineRegistry();
    const launch = launchWorkflowRecipe({
      runId,
      workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: "launch-thread",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("original"), "original-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async () => {},
      newId: () => crypto.randomUUID(),
      nowIso: () => "2026-07-19T00:00:00.000Z",
      repairIntent: { goal: "finish", expectedOutcome: "valid result", guardrails: [] },
      readWorkflowSource: async () => NodeFS.readFileSync(workflowPath, "utf8"),
      replaceWorkflowSource: async () => {},
    });

    const childId = `${runId}:repair:1`;
    for (let attempt = 0; attempt < 40 && registry.peekPending(childId) === undefined; attempt += 1)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(registry.peekPending(childId)).toBeDefined();

    registry.cancelRun(runId);

    expect(await launch).toEqual({ runId, status: "suspended" });
    expect(registry.peekPending(childId)).toBeUndefined();
  });

  it("repairs atomically and resumes the same run without replaying completed work or creating UI children", async () => {
    const runId = "self-heal-run";
    const workflowPath = NodePath.join(root, runId, "workflow.ts");
    NodeFS.mkdirSync(NodePath.dirname(workflowPath), { recursive: true });
    NodeFS.writeFileSync(workflowPath, brokenSource);
    const registry = makeWorkflowEngineRegistry();
    const commands: OrchestrationCommand[] = [];
    let ids = 0;
    const launch = launchWorkflowRecipe({
      runId,
      workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: "launch-thread",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("original"), "original-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        commands.push(command);
      },
      newId: () => `id-${++ids}`,
      nowIso: () => "2026-07-19T00:00:00.000Z",
      repairIntent: { goal: "finish", expectedOutcome: "valid result", guardrails: ["same run"] },
      repairModelSelection: createModelSelection(
        ProviderInstanceId.make("nexplore"),
        "nexplore/coding",
      ),
      repairMaxAttempts: 3,
      readWorkflowSource: async () => NodeFS.readFileSync(workflowPath, "utf8"),
      // The production source replacer uses a sibling temp file + rename. This seam verifies the
      // host only supplies the repaired source once and keeps the original as audit evidence.
      replaceWorkflowSource: async (source) => {
        const originalPath = `${workflowPath}.original`;
        if (!NodeFS.existsSync(originalPath)) NodeFS.copyFileSync(workflowPath, originalPath);
        const tempPath = `${workflowPath}.tmp`;
        NodeFS.writeFileSync(tempPath, source);
        NodeFS.renameSync(tempPath, workflowPath);
      },
    });

    // Let the failed workflow create its hidden repair child, then settle that child's turn.
    const repair = await waitForRepair(registry, `${runId}:repair:1`);
    expect(repair?.kind).toBe("thread.turn");
    // Pending delivery is only exposed after the hidden child create command has
    // completed, so its ephemeral retention is already durable before any shell
    // subscriber can observe the turn.
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "thread.create",
          threadId: `${runId}:repair:1`,
          retention: "ephemeral",
        }),
      ]),
    );
    await repair!.resolveLive!(
      JSON.stringify({
        safeToResume: true,
        correctedWorkflow: fixedSource,
        summary: "removed throw",
      }),
    );
    expect(await launch).toEqual({ runId, status: "completed" });

    expect(NodeFS.readFileSync(workflowPath, "utf8")).toBe(fixedSource);
    expect(NodeFS.readFileSync(`${workflowPath}.original`, "utf8")).toBe(brokenSource);
    // The one-way message completed before the runtime error and is replayed from the journal.
    expect(
      commands.filter(
        (command) =>
          command.type === "thread.message.upsert" &&
          command.message.text === "The first completed step",
      ),
    ).toHaveLength(1);
    const creates = commands.filter((command) => command.type === "thread.create");
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      threadId: `${runId}:repair:1`,
      modelSelection: { instanceId: "nexplore", model: "nexplore/coding" },
      retention: "ephemeral",
    });
    expect(
      commands.some(
        (command) =>
          command.type === "thread.activity.append" &&
          command.activity.kind === "t3work.handoff.created",
      ),
    ).toBe(false);

    const repairStatuses = commands.flatMap((command) =>
      command.type === "thread.activity.append" &&
      command.activity.kind === "t3work.recipe.workflow.step"
        ? [
            {
              detail: String((command.activity.payload as { detail?: string }).detail ?? ""),
              summary: command.activity.summary,
              stepKind: String((command.activity.payload as { stepKind?: string }).stepKind ?? ""),
            },
          ]
        : [],
    );
    const repairLabels = repairStatuses
      .filter((activity) => activity.stepKind === "workflow.self-heal")
      .map((activity) => activity.detail);
    expect(repairLabels).toEqual([
      "Analysing failure",
      "Repairing workflow",
      "Resuming workflow",
      "Workflow recovered",
    ]);
    expect(
      repairStatuses
        .filter((activity) => activity.stepKind === "workflow.self-heal")
        .map((activity) => activity.summary),
    ).toEqual(repairLabels);
    expect(registry.getRun(runId)).toBeUndefined();
  });

  it("rejects invalid repair output, then accepts a later fixed source in the same repair budget", async () => {
    const runId = "invalid-then-fixed";
    const workflowPath = NodePath.join(root, runId, "workflow.ts");
    NodeFS.mkdirSync(NodePath.dirname(workflowPath), { recursive: true });
    NodeFS.writeFileSync(
      workflowPath,
      'export const meta = { name: "self-heal", capabilities: ["user"] };\nthis is not valid workflow TypeScript',
    );
    const registry = makeWorkflowEngineRegistry();
    const commands: OrchestrationCommand[] = [];
    const launch = launchWorkflowRecipe({
      runId,
      workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: "launch-thread",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("original"), "original-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        commands.push(command);
      },
      newId: () => crypto.randomUUID(),
      nowIso: () => "2026-07-19T00:00:00.000Z",
      repairIntent: { goal: "parse", expectedOutcome: "valid", guardrails: [] },
      repairMaxAttempts: 3,
      readWorkflowSource: async () => NodeFS.readFileSync(workflowPath, "utf8"),
      replaceWorkflowSource: async (source) => {
        NodeFS.writeFileSync(workflowPath, source);
      },
    });
    const first = await waitForRepair(registry, `${runId}:repair:1`);
    await first!.resolveLive!("not JSON");
    const second = await waitForRepair(registry, `${runId}:repair:2`);
    await second!.resolveLive!(
      JSON.stringify({ outcome: "fixed", updatedSource: fixedSource, summary: "valid now" }),
    );

    expect(await launch).toEqual({ runId, status: "completed" });
    expect(commands.filter((command) => command.type === "thread.create")).toHaveLength(2);
  });

  it("uses all three configured cannot-fix attempts before terminal failure", async () => {
    const runId = "cannot-fix-three";
    const workflowPath = NodePath.join(root, runId, "workflow.ts");
    NodeFS.mkdirSync(NodePath.dirname(workflowPath), { recursive: true });
    NodeFS.writeFileSync(workflowPath, "not valid TypeScript");
    const registry = makeWorkflowEngineRegistry();
    const commands: OrchestrationCommand[] = [];
    const launch = launchWorkflowRecipe({
      runId,
      workflowPath,
      args: {},
      runsRoot: root,
      launchThreadId: "launch-thread",
      projectId: ProjectId.make("project-1"),
      modelSelection: createModelSelection(ProviderInstanceId.make("original"), "original-model"),
      runtimeMode: "full-access",
      interactionMode: "default",
      registry,
      dispatch: async (command) => {
        commands.push(command);
      },
      newId: () => crypto.randomUUID(),
      nowIso: () => "2026-07-19T00:00:00.000Z",
      repairIntent: { goal: "parse", expectedOutcome: "valid", guardrails: [] },
      repairMaxAttempts: 3,
      readWorkflowSource: async () => NodeFS.readFileSync(workflowPath, "utf8"),
      replaceWorkflowSource: async () => {
        throw new Error("must not replace cannot-fix source");
      },
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const pending = await waitForRepair(registry, `${runId}:repair:${attempt}`);
      await pending!.resolveLive!(JSON.stringify({ outcome: "cannot-fix", reason: "unsupported" }));
    }
    expect(await launch).toEqual({ runId, status: "failed" });
    expect(commands.filter((command) => command.type === "thread.create")).toHaveLength(3);
    expect(registry.getRun(runId)).toBeUndefined();
  });
});
