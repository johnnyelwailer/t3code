// @effect-diagnostics nodeBuiltinImport:off - writes the scaffolded workflows to a temp recipe dir.
/**
 * Executes the SCAFFOLDED `fix-this-bug` and `implement-this` bodies — the exact files project
 * setup writes, `workflow.ts` beside its `unit.workflow.ts` — through the real engine. Only the
 * workflow host is a recording fake; every agent turn and user answer is supplied the way the
 * reactor supplies them, in the order the run parks on them.
 */

import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { deriveWorkflowShape } from "@t3team/sdk";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";

import { threadId } from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { makeWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeRecordingDraftBroker } from "./t3team-workflowHostDraft.fixtures.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";
import { makeFakeWorkflowHost } from "./t3team-workflowHostFake.fixtures.ts";
import {
  FIX_THIS_BUG_RECIPE_ID,
  IMPLEMENT_THIS_RECIPE_ID,
  workItemDeliverySetupFiles,
} from "./t3team-projectSetupWorkItemDeliveryRecipes.ts";
import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-work-item-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

/** Writes a recipe's scaffolded workflow files into their own directory; returns `workflow.ts`. */
function scaffold(recipeId: string): string {
  const dir = NodePath.join(runsRoot, recipeId);
  NodeFS.mkdirSync(dir, { recursive: true });
  for (const file of workItemDeliverySetupFiles(recipeId)) {
    NodeFS.writeFileSync(NodePath.join(dir, NodePath.basename(file.relativePath)), file.contents);
  }
  return NodePath.join(dir, "workflow.ts");
}

const RECIPE_IDS = [FIX_THIS_BUG_RECIPE_ID, IMPLEMENT_THIS_RECIPE_ID];
const workflowPaths = new Map(RECIPE_IDS.map((recipeId) => [recipeId, scaffold(recipeId)]));

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
let runCount = 0;

function unitReport(overrides: Record<string, unknown> = {}) {
  return {
    done: true,
    summary: "done",
    childThreadId: "child-1",
    branch: "feature/shop-7",
    worktreePath: "/work/shop-7",
    evidence: [],
    steps: [],
    url: "",
    blocker: "",
    ...overrides,
  };
}

/** Runs a scaffolded body, answering each park in order; returns what the run asked and did. */
async function runRecipe(
  recipeId: string,
  replies: ReadonlyArray<unknown>,
  args: Readonly<Record<string, unknown>> = {},
) {
  const { broker } = await makeRecordingDraftBroker();
  const host = makeFakeWorkflowHost();
  const registry = makeWorkflowEngineRegistry();
  const runId = `${recipeId}-${(runCount += 1)}`;
  const completed: unknown[] = [];
  const errors: unknown[] = [];
  let seq = 0;

  const launched = await launchWorkflowRecipe({
    runId,
    workflowPath: workflowPaths.get(recipeId) ?? "",
    args,
    runsRoot,
    launchThreadId: threadId,
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    registry,
    host: host.host,
    newId: () => `${runId}-id-${(seq += 1)}`,
    nowIso: () => "2026-10-19T00:00:00.000Z",
    hostToolClient: makeT3TeamWorkflowHostToolClient({ broker, launchThreadId: threadId })!,
    onComplete: async (output) => {
      completed.push(output);
    },
    onError: async (error) => {
      errors.push(error);
    },
  });

  const parked: string[] = [];
  for (const value of replies) {
    const pending = registry.peekPending(threadId);
    if (pending === undefined) {
      throw new Error(
        `run settled before reply ${parked.length + 1}: ${launched.status} ${String(errors[0])}`,
      );
    }
    parked.push(pending.kind);
    await registry.getRun(runId)?.resume(pending.correlationId, value);
  }

  return {
    parked,
    completed,
    errors,
    stillParked: registry.peekPending(threadId) !== undefined,
    prompts: host.turns().map((turn) => turn.text),
    questions: host
      .messages()
      .filter((message) => message.ext?.status === "waiting-for-input")
      .map((message) => message.text),
  };
}

const BUG_BRIEF = {
  issueKey: "SHOP-7",
  title: "Totals round wrong",
  expected: "Totals round to two decimals",
  actual: "Totals show three decimals",
  suspectedRepository: "acme/shop",
  baseRef: "main",
  questions: ["Did it ever work?", "Which screens?"],
};

describe("fix-this-bug bundled workflow", () => {
  it("asks the behaviour questions before any code unit, then reproduces, fixes and verifies in one child", async () => {
    const run = await runRecipe(FIX_THIS_BUG_RECIPE_ID, [
      BUG_BRIEF,
      { answers: "Never worked; checkout only.", baseRef: "release/2.1" },
      unitReport({ summary: "Failing test added" }),
      unitReport({ summary: "Rounding used floor" }),
      unitReport({ evidence: ["vp test: 12 passed"], url: "http://localhost:5173/checkout" }),
      false,
    ]);

    expect(run.errors).toHaveLength(0);
    expect(run.parked).toEqual([
      "thread.turn",
      "user.input",
      "thread.turn",
      "thread.turn",
      "thread.turn",
      "user.input",
    ]);
    expect(run.prompts[0]).toContain(`${PROJECT_STATE_DIR}/context/work-items/index.json`);
    expect(run.prompts[0]).toContain("Do not scan any code yet");
    expect(run.questions[0]).toContain("1. Did it ever work?");

    const [reproduce, fix, verify] = run.prompts.slice(1);
    expect(reproduce).toContain("delegate_task");
    expect(reproduce).toContain("repository: 'acme/shop', baseRef: 'release/2.1'");
    expect(reproduce).toContain("Never worked; checkout only.");
    expect(fix).toContain("t3_thread_send");
    expect(fix).toContain("child-1");
    expect(verify).toContain("start\nthe app on a free port");

    expect(run.questions[1]).toContain("Rounding used floor");
    expect(run.questions[1]).toContain("http://localhost:5173/checkout");
    expect(run.prompts.join("\n")).not.toContain("DRAFT pull request");
    expect(run.completed[0]).toMatchObject({ issueKey: "SHOP-7", done: true });
  });

  it("stops at Reproduce when the bug does not reproduce and the user gives no guidance", async () => {
    const run = await runRecipe(FIX_THIS_BUG_RECIPE_ID, [
      BUG_BRIEF,
      { answers: "Always on checkout." },
      unitReport({ done: false, blocker: "Totals round correctly on main" }),
      "",
    ]);

    expect(run.errors).toHaveLength(0);
    expect(run.questions[1]).toContain("Reproduce is blocked: Totals round correctly on main");
    expect(run.prompts).toHaveLength(2);
    expect(run.completed[0]).toMatchObject({ issueKey: "SHOP-7", stoppedAt: "Reproduce" });
  });

  it("retries a blocked unit once with the user's guidance, in the same child", async () => {
    const run = await runRecipe(FIX_THIS_BUG_RECIPE_ID, [
      BUG_BRIEF,
      { answers: "Always on checkout." },
      unitReport({ done: false, blocker: "Needs a seeded cart" }),
      "Use the demo cart fixture.",
      unitReport({ done: false, blocker: "Still green" }),
    ]);

    expect(run.prompts[2]).toContain("t3_thread_send");
    expect(run.prompts[2]).toContain("Use the demo cart fixture.");
    expect(run.completed[0]).toMatchObject({ stoppedAt: "Reproduce", blocker: "Still green" });
  });
});

describe("implement-this bundled workflow", () => {
  const SPEC_BRIEF = {
    issueKey: "SHOP-9",
    title: "Gift cards",
    goal: "Pay with a gift card",
    suspectedRepository: "acme/shop",
    baseRef: "main",
    questions: ["Partial payments?"],
  };
  const PLAN = unitReport({ summary: "Two slices", steps: ["Redeem a card", "Show balance"] });

  it("changes no code before the go-ahead, then builds each slice and opens a draft PR on request", async () => {
    const run = await runRecipe(IMPLEMENT_THIS_RECIPE_ID, [
      SPEC_BRIEF,
      { answers: "Yes, partial payments." },
      PLAN,
      true,
      unitReport(),
      unitReport(),
      unitReport({ evidence: ["e2e passed"], url: "http://localhost:5173" }),
      true,
      unitReport({ url: "https://github.com/acme/shop/pull/12" }),
    ]);

    expect(run.errors).toHaveLength(0);
    const [plan, sliceOne, sliceTwo, , draftPr] = run.prompts.slice(1);
    expect(plan).toContain("delegate_task");
    expect(plan).toContain("Change nothing");
    expect(run.questions[1]).toContain("Redeem a card");
    expect(sliceOne).toContain("Slice 1 of 2: Redeem a card");
    expect(sliceTwo).toContain("Slice 2 of 2: Show balance");
    expect(draftPr).toContain("DRAFT pull request against main");
    expect(draftPr).toContain("never request or assign reviewers");
    expect(run.completed[0]).toMatchObject({
      issueKey: "SHOP-9",
      done: true,
      url: "https://github.com/acme/shop/pull/12",
    });
  });

  it("revises the plan in the same child instead of building when the user asks for changes", async () => {
    const run = await runRecipe(IMPLEMENT_THIS_RECIPE_ID, [
      SPEC_BRIEF,
      { answers: "No partial payments." },
      PLAN,
      false,
      "Merge both slices.",
    ]);

    expect(run.stillParked).toBe(true);
    expect(run.prompts.at(-1)).toContain("t3_thread_send");
    expect(run.prompts.at(-1)).toContain("Revise the previous plan: Merge both slices.");
    expect(run.prompts.join("\n")).not.toContain("Slice 1 of");
  });
});

describe("launch arguments", () => {
  const LAUNCH_ARGS = {
    issueIdOrKey: "SHOP-7",
    workItem: { key: "SHOP-7", provider: "atlassian", project: "project-1" },
  };

  it.each([
    [FIX_THIS_BUG_RECIPE_ID, "Read the bug SHOP-7."],
    [IMPLEMENT_THIS_RECIPE_ID, "Read the work item SHOP-7."],
  ])(
    "%s reads the work item the launch names before asking the agent to find it",
    async (recipeId, line) => {
      const run = await runRecipe(recipeId, [], LAUNCH_ARGS);
      expect(run.errors).toHaveLength(0);
      expect(run.prompts[0]).toContain(line);
      expect(run.prompts[0]).not.toContain("this thread was started for");
    },
  );

  it("falls back to the workItem key when the launch passes no issueIdOrKey", async () => {
    const run = await runRecipe(FIX_THIS_BUG_RECIPE_ID, [], { workItem: { key: "SHOP-8" } });
    expect(run.prompts[0]).toContain("Read the bug SHOP-8.");
  });

  it("has the agent find the thread's work item when the launch passes nothing", async () => {
    const run = await runRecipe(FIX_THIS_BUG_RECIPE_ID, []);
    expect(run.prompts[0]).toContain("Find the bug this thread was started for");
  });
});

describe("work-item delivery scaffolding", () => {
  it("embeds each body as source text under a real node process, the dev backend's loader", () => {
    const bodiesUrl = new URL("./t3team-workItemDeliveryBodies.ts", import.meta.url);
    const printed = NodeChildProcess.execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(bodiesUrl.href)});
         process.stdout.write(JSON.stringify([m.FIX_THIS_BUG_WORKFLOW_BODY,
           m.IMPLEMENT_THIS_WORKFLOW_BODY, m.WORK_ITEM_UNIT_WORKFLOW_BODY]));`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const sources = [
      "./t3team-fixThisBug.workflow.ts",
      "./t3team-implementThis.workflow.ts",
      "./t3team-workItemUnit.workflow.ts",
    ].map((file) => NodeFS.readFileSync(new URL(file, import.meta.url), "utf8"));
    expect(JSON.parse(printed)).toEqual(sources);
  });

  it.each(RECIPE_IDS)(
    "ships %s as a workflow-backed recipe with its own copy of the shared unit",
    (recipeId) => {
      const files = renderBundledRecipeSetupFiles();
      const root = `${PROJECT_STATE_DIR}/recipes/${recipeId}`;
      const byPath = new Map(files.map((file) => [file.relativePath, file.contents]));
      expect(byPath.get(`${root}/recipe.ts`)).toContain(
        'defineWorkflow<typeof Workflow>("./workflow.ts")',
      );
      expect(byPath.get(`${root}/workflow.ts`)).toContain(
        'defineWorkflow<typeof Unit>("./unit.workflow.ts")',
      );
      expect(byPath.get(`${root}/unit.workflow.ts`)).toContain('name: "work-item.unit"');
    },
  );

  it.each(RECIPE_IDS)("files every planned step of %s under a phase it declares", (recipeId) => {
    const workflowPath = workflowPaths.get(recipeId) ?? "";
    const shape = deriveWorkflowShape({
      absolutePath: workflowPath,
      sourceText: NodeFS.readFileSync(workflowPath, "utf8"),
    });
    const declared = new Set(shape.phases.map((phase) => phase.title));
    expect(declared.size).toBeGreaterThan(0);
    for (const step of shape.steps) expect(declared.has(step.phase ?? "")).toBe(true);
  });
});
