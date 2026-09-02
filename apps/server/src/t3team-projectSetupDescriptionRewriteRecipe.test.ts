/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- The launch/resume API is promise-shaped; the broker layer is bridged once, like its siblings. */
// @effect-diagnostics nodeBuiltinImport:off - writes the scaffolded workflow to a temp runs root.
/**
 * Executes the SCAFFOLDED `describe-rewrite` body — the exact string
 * `renderDescriptionRewriteWorkflow()` writes into a user's workspace — through the real engine.
 *
 * A rendered workflow is not typechecked, so running it is the only thing that keeps it honest.
 * Everything under the fixture is production wiring: the real `T3TeamToolBrokerLive` (hence the
 * real `publishDraft`), the real `launchWorkflowRecipe`, the real suspend/resume machinery. Only
 * the orchestration engine is a recording stub, and the human/agent reply(ies) are supplied the
 * way the reactor supplies them: NONE when the caller already supplied intent (the body skips
 * `askUser` entirely and runs straight to the writer turn), exactly ONE `askUser` reply when it
 * didn't, then always the writer's `askAgent` reply.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  type OrchestrationCommand,
  ProjectId,
  ProviderInstanceId,
  type T3TeamMessageExt,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { deriveWorkflowShape } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { type OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { T3TeamToolBroker, type T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import {
  makeWorkflowEngineRegistry,
  type T3TeamWorkflowEngineRegistryShape,
} from "./t3team-workflowEngineRegistry.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";
import {
  DESCRIPTION_REWRITE_RECIPE_ID,
  renderDescriptionRewriteWorkflow,
} from "./t3team-projectSetupDescriptionRewriteRecipe.ts";
import { renderBundledRecipeSetupFiles } from "./t3team-projectSetupRecipes.ts";

const DRAFT_TOOL = "t3team.work_item.description.draft_update";
const WRITTEN_DESCRIPTION =
  "## Goal\nCheckout must round to two decimals.\n\n## Acceptance criteria\n- Totals match the invoice.";
const WRITTEN = { description: WRITTEN_DESCRIPTION };

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-rewrite-"));
const workflowPath = NodePath.join(runsRoot, "workflow.ts");
// The scaffolded artifact itself is the unit under test.
NodeFS.writeFileSync(workflowPath, renderDescriptionRewriteWorkflow(), "utf8");
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const projectId = ProjectId.make("project-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");
const ISO = "2026-07-27T00:00:00.000Z";

async function makeBrokerWithSeededThread(): Promise<{
  readonly broker: T3TeamToolBrokerShape;
  readonly brokerDispatched: ReadonlyArray<OrchestrationCommand>;
}> {
  const brokerDispatched: OrchestrationCommand[] = [];
  const orchestrationMock: OrchestrationEngineShape = {
    readEvents: () => Stream.empty,
    dispatch: (command) => {
      brokerDispatched.push(command);
      return Effect.succeed({ sequence: brokerDispatched.length });
    },
    streamDomainEvents: Stream.empty,
    subscribeDomainEvents: Effect.acquireRelease(Effect.succeed(Stream.empty), () => Effect.void),
    latestSequence: Effect.succeed(0),
  };
  const broker = await Effect.runPromise(
    Effect.gen(function* () {
      const resolved = yield* T3TeamToolBroker;
      yield* resolved.bindSession({
        threadId,
        toolContext: createThreadToolContext({
          tools: [{ id: DRAFT_TOOL, label: "Draft description", capabilities: ["write"] }],
        }),
      });
      return resolved;
    }).pipe(Effect.provide(makeBrokerLayer(orchestrationMock))),
  );
  return { broker, brokerDispatched };
}

/** Answer whatever the run is currently parked on, the way the reactor does. */
async function reply(registry: T3TeamWorkflowEngineRegistryShape, runId: string, value: unknown) {
  const pending = registry.peekPending(threadId);
  if (pending === undefined) throw new Error("expected the run to be parked on an ask");
  await registry.getRun(runId)?.resume(pending.correlationId, value);
  return pending;
}

function turnPrompts(commands: ReadonlyArray<OrchestrationCommand>): ReadonlyArray<string> {
  return commands.flatMap((command) =>
    command.type === "thread.turn.start" ? [command.message.text] : [],
  );
}

function userQuestions(commands: ReadonlyArray<OrchestrationCommand>): ReadonlyArray<string> {
  return commands.flatMap((command) =>
    command.type === "thread.message.upsert" &&
    command.message.t3teamExt?.status === "waiting-for-input"
      ? [command.message.text]
      : [],
  );
}

function draftCarrier(commands: ReadonlyArray<OrchestrationCommand>) {
  for (const command of commands) {
    if (command.type !== "thread.message.upsert") continue;
    const ext: T3TeamMessageExt | undefined = command.message.t3teamExt;
    const attachment = ext?.attachments?.find((entry) => entry.kind === "draft-mutation");
    if (attachment !== undefined) return { command, attachment };
  }
  return undefined;
}

async function runRewrite(input: {
  readonly runId: string;
  readonly args: unknown;
  // One reply per parked `askUser`: EMPTY when notes were already supplied (the body skips the
  // ask entirely and runs straight to the writer), exactly one when nothing was supplied yet.
  readonly userAnswers: ReadonlyArray<string>;
}) {
  const { broker, brokerDispatched } = await makeBrokerWithSeededThread();
  const runDispatched: OrchestrationCommand[] = [];
  const registry = makeWorkflowEngineRegistry();
  const completed: unknown[] = [];
  const errors: unknown[] = [];
  let seq = 0;

  const launched = await launchWorkflowRecipe({
    runId: input.runId,
    workflowPath,
    args: input.args,
    runsRoot,
    launchThreadId: threadId,
    projectId,
    modelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    registry,
    dispatch: async (command) => {
      runDispatched.push(command);
    },
    newId: () => `${input.runId}-id-${(seq += 1)}`,
    nowIso: () => ISO,
    hostToolClient: makeT3TeamWorkflowHostDraftToolClient({ broker, launchThreadId: threadId })!,
    onComplete: async (output) => {
      completed.push(output);
    },
    onError: async (error) => {
      errors.push(error);
    },
  });

  // 1. parked on the deterministic askUser gate, ONLY when no intent was supplied yet — the body
  // skips the ask entirely once notes (instructions and/or anchored comments) are already in hand.
  const gates: Array<Awaited<ReturnType<typeof reply>>> = [];
  for (const answer of input.userAnswers) {
    gates.push(await reply(registry, input.runId, answer));
  }
  // 2. parked on the writer turn, on the LAUNCH thread — always present.
  const writer = await reply(registry, input.runId, WRITTEN);

  return {
    launched,
    gates,
    writer,
    completed,
    errors,
    runDispatched,
    brokerDispatched,
  };
}

describe("describe-rewrite bundled workflow", () => {
  it("skips the ask and writes straight from supplied instructions, then proposes the writer's text as a draft", async () => {
    const run = await runRewrite({
      runId: "rewrite-basic",
      args: {
        issueIdOrKey: "T3-42",
        summary: "Checkout rounding",
        currentBody: "Rounding is wrong.",
        instructions: "Add acceptance criteria.",
      },
      userAnswers: [],
    });

    expect(run.launched.status).toBe("suspended");
    // No confirmation card at all: supplying instructions already IS the human stating intent,
    // so asking again would cost a click and gather nothing new.
    expect(run.gates).toHaveLength(0);
    expect(userQuestions(run.runDispatched)).toHaveLength(0);
    // The writer runs on the LAUNCH thread — never a spawned child. `thread.create` would be the
    // fingerprint of `agent()`/`spawnThread()`, whose draft would land where nobody can see it.
    expect(run.writer.kind).toBe("thread.turn");
    const turns = run.runDispatched.filter((command) => command.type === "thread.turn.start");
    expect(turns).toHaveLength(1);
    expect(turns[0]?.threadId).toBe(threadId);
    expect(run.runDispatched.some((command) => command.type === "thread.create")).toBe(false);
    expect(run.errors).toHaveLength(0);
    expect(run.completed[0]).toMatchObject({ issueIdOrKey: "T3-42", proposed: true });

    // The writer is told to return a structured value and touch nothing.
    const prompt = turnPrompts(run.runDispatched)[0] ?? "";
    expect(prompt).toContain("T3-42");
    expect(prompt).toContain("Rounding is wrong.");
    expect(prompt).toContain("Add acceptance criteria.");
    expect(prompt).toContain("exactly one JSON object with one key: description");
    expect(prompt).toContain("Do not EDIT anything");
    // …and WHERE to read the item from: the work tracker is mirrored to disk, so a writer left to
    // guess searches the workspace, finds nothing, and writes filler. The file name is the key
    // lowercased with non-alphanumerics collapsed, exactly as the context sync writes it.
    expect(prompt).toContain(".t3team/context/work-items/t3-42.json");
    expect(prompt).toContain(".t3team/context/work-items/index.json");
    expect(prompt).toContain("availability");
    expect(prompt).toContain("fullBundleRootRelativePath");
    expect(prompt).toContain("ticketEntryPointRelativePath");

    // The BODY proposed only the structured description field, never an agent preamble.
    const carrier = draftCarrier(run.brokerDispatched);
    expect(carrier?.command.threadId).toBe(threadId);
    expect(carrier?.attachment).toMatchObject({
      kind: "draft-mutation",
      draft: {
        tool: DRAFT_TOOL,
        field: "description",
        target: { issueIdOrKey: "T3-42" },
        patch: { description: WRITTEN_DESCRIPTION },
      },
    });
  });

  it("skips the ask and carries every anchored note into the writer prompt when comments were supplied", async () => {
    const run = await runRewrite({
      runId: "rewrite-anchored",
      args: {
        issueIdOrKey: "T3-77",
        summary: "Login flow",
        currentBody: "Users log in.",
        comments: [
          { blockId: "b1", quote: "Users log in.", body: "Say which identity provider." },
          { blockId: "b2", quote: "log in", body: "Cover the SSO failure path too." },
        ],
      },
      userAnswers: [],
    });

    // Annotating and submitting already stated the intent, so no confirmation card is asked for.
    expect(run.gates).toHaveLength(0);
    expect(userQuestions(run.runDispatched)).toHaveLength(0);

    // Both anchored notes reach the writer as targeted instructions — not just the last one.
    const prompt = turnPrompts(run.runDispatched)[0] ?? "";
    expect(prompt).toContain('On "Users log in.": Say which identity provider.');
    expect(prompt).toContain('On "log in": Cover the SSO failure path too.');

    expect(run.errors).toHaveLength(0);
    expect(draftCarrier(run.brokerDispatched)?.attachment).toMatchObject({
      draft: { target: { issueIdOrKey: "T3-77" }, patch: { description: WRITTEN_DESCRIPTION } },
    });
  });

  it("declares exactly the phases its body runs, with steps the live card can match", () => {
    // The live card groups rows by the phase the SHAPE SCAN assigns and heads them from the
    // declared strip. A strip that names a phase the body never declares ("Confirm" while the body
    // calls phase("Ask")) files real steps under a phantom group; a non-static step label
    // ("Rewrite " + key) degrades to "Ask the agent", which no runtime step can ever match, so the
    // writer turn is rendered as unplanned work under the previous phase.
    const source = renderDescriptionRewriteWorkflow();
    const shape = deriveWorkflowShape({ absolutePath: workflowPath, sourceText: source });
    expect(shape.phases.map((phase) => phase.title)).toEqual(["Ask", "Write", "Propose"]);
    const declared = new Set(shape.phases.map((phase) => phase.title));
    for (const step of shape.steps) expect(declared.has(step.phase ?? "")).toBe(true);
    const writer = shape.steps.find((step) => step.kind === "agent");
    expect(writer?.phase).toBe("Write");
    expect(writer?.label).not.toBe("Ask the agent");
    // The runtime step's label starts with the authored one, which is what makes them match.
    expect(`${writer?.label ?? ""} T3-42`.startsWith(writer?.label ?? "x")).toBe(true);
  });

  it("ships to a workspace as a workflow-backed bundled recipe, with no authoring by the user", () => {
    const files = renderBundledRecipeSetupFiles();
    const paths = files.map((file) => file.relativePath);
    expect(paths).toContain(`.t3team/recipes/${DESCRIPTION_REWRITE_RECIPE_ID}/workflow.ts`);
    expect(paths).toContain(`.t3team/recipes/${DESCRIPTION_REWRITE_RECIPE_ID}/recipe.ts`);

    // The recipe module must point its default action at that workflow, or discovery would treat
    // the recipe as prompt-backed and the body would never run.
    const module = files.find(
      (file) => file.relativePath === `.t3team/recipes/${DESCRIPTION_REWRITE_RECIPE_ID}/recipe.ts`,
    );
    expect(module?.contents).toContain('defineWorkflow<typeof Workflow>("./workflow.ts")');
    expect(module?.contents).toContain('"mutation.draft"');
  });

  it("asks exactly once when no intent was supplied yet, and the reply becomes the intent", async () => {
    const run = await runRewrite({
      runId: "rewrite-freeform",
      args: {
        issueIdOrKey: "T3-9",
        summary: "Empty backlog item",
      },
      userAnswers: ["Explain the retry behavior."],
    });

    // With nothing supplied, the deterministic gate is a single user.input ask — not an agent turn.
    expect(run.gates).toHaveLength(1);
    expect(run.gates[0]?.kind).toBe("user.input");
    const question = userQuestions(run.runDispatched)[0] ?? "";
    expect(question).toBe("What should change in the description of T3-9?");

    // The reply becomes the intent that reaches the writer.
    const prompt = turnPrompts(run.runDispatched)[0] ?? "";
    expect(prompt).toContain("Explain the retry behavior.");
    expect(run.errors).toHaveLength(0);
    expect(run.completed[0]).toMatchObject({ issueIdOrKey: "T3-9", proposed: true });
  });
});
