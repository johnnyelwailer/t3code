/**
 * The `implement-this` bundled recipe: understand a story or task, close its spec gaps with the
 * user, plan it in vertical slices, and build each slice test-first in a coding child's own
 * worktree once the user said go. Scaffolded into `.t3team/recipes/implement-this/workflow.ts`
 * beside the shared `unit.workflow.ts`.
 *
 * The plan unit only reads code; nothing is changed before the Go-Ahead gate.
 *
 * The work item comes from the launch's `issueIdOrKey` or `workItem.key` when it passes them; a
 * launch that passes neither has the launch thread's agent find the thread's linked work item.
 */
import { Schema } from "effect";
import { defineWorkflow, getArgs, getThread, phase, workflow } from "@t3team/sdk";

import type * as Unit from "./t3team-workItemUnit.workflow.ts";

export const Inputs = Schema.Struct({
  issueIdOrKey: Schema.optional(Schema.String),
  workItem: Schema.optional(
    Schema.Struct({
      key: Schema.String,
      provider: Schema.optional(Schema.String),
      project: Schema.optional(Schema.String),
    }),
  ),
  instructions: Schema.optional(Schema.String),
});

export const meta = {
  name: "work-item.implement-this",
  description:
    "Plan a work item in slices, build them test-first, then offer a draft pull request.",
  inputs: Inputs,
  phases: [
    { title: "Understand" },
    { title: "Clarify" },
    { title: "Plan" },
    { title: "Build" },
    { title: "Verify" },
    { title: "Hand off" },
  ],
  capabilities: ["user"],
} as const;

const decodeInputs = Schema.decodeUnknownSync(Inputs);

const MAX_PLAN_ROUNDS = 3;

const SpecBrief = Schema.Struct({
  issueKey: Schema.String,
  title: Schema.String,
  goal: Schema.String,
  suspectedRepository: Schema.String,
  baseRef: Schema.String,
  questions: Schema.Array(Schema.String),
});

const Checkpoint = Schema.Struct({
  answers: Schema.String,
  repository: Schema.optional(Schema.String),
  baseRef: Schema.optional(Schema.String),
});

function understandPrompt(input: typeof Inputs.Type): string {
  const named = input.issueIdOrKey ?? input.workItem?.key ?? "";
  return [
    named.length > 0
      ? "Read the work item " + named + "."
      : "Find the work item this thread was started for (its linked work item) and read it.",
    "Read it from the workspace context mirror, a file read rather than an API call:",
    ".t3team/context/work-items/index.json maps each key to its file. Read the description, the",
    "acceptance criteria, every attachment, the comments and the parent.",
    input.instructions !== undefined && input.instructions.length > 0
      ? "The user added: " + input.instructions
      : "",
    "Do not scan any code yet.",
    "",
    "Return exactly one JSON object: issueKey, title, goal (one sentence), suspectedRepository",
    "(owner/name of the linked repository the work lives in), baseRef (that repository's default",
    "branch unless the ticket names another) and questions: the spec gaps, ambiguities and",
    "contradictions only the user can resolve. Ask nothing the ticket or the code can answer.",
  ].join("\n");
}

function checkpointQuestion(brief: typeof SpecBrief.Type): string {
  return [
    brief.issueKey + ": " + brief.goal,
    ...brief.questions.map((question, index) => index + 1 + ". " + question),
    "",
    "Target: " + brief.suspectedRepository + " from " + brief.baseRef + ". Change it if needed.",
  ].join("\n");
}

const PLAN_TASK = [
  "Read the code and plan the work. Change nothing: no edits, no commits, no tests run yet.",
  "Split it into vertical slices, each one user-visible behaviour that can be tested and verified",
  "on its own. Put one line per slice in steps, in build order, and the plan with impacted areas,",
  "risks and how each slice is verified in summary.",
].join("\n");

export default async function run() {
  const input = decodeInputs(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error("implement-this needs the chat it was launched from; it cannot run headless.");
  }
  const unit = defineWorkflow<typeof Unit>("./t3team-workItemUnit.workflow.ts");

  phase("Understand");
  const brief = await thread.askAgent(understandPrompt(input), {
    label: `Read the work item`,
    schema: SpecBrief,
  });

  phase("Clarify");
  const checkpoint = await thread.askUser(checkpointQuestion(brief), {
    label: "Spec gaps",
    schema: Checkpoint,
  });
  const target = {
    issueKey: brief.issueKey,
    repository: checkpoint.repository || brief.suspectedRepository,
    baseRef: checkpoint.baseRef || brief.baseRef,
    brief: [
      brief.title,
      "Goal: " + brief.goal,
      "Confirmed by the user: " + checkpoint.answers,
    ].join("\n"),
  };

  phase("Plan");
  let plan = await workflow(unit, { ...target, title: "Plan", task: PLAN_TASK });
  let approved = false;
  for (let round = 1; plan.done && !approved && round <= MAX_PLAN_ROUNDS; round += 1) {
    approved = await thread.askUser(plan.summary + "\n\n" + plan.steps.join("\n"), {
      label: "Go ahead",
      schema: Schema.Boolean,
      labels: { true: "Go ahead", false: "Revise" },
    });
    if (approved || round === MAX_PLAN_ROUNDS) continue;
    const change = await thread.askUser("What should change in the plan?", {
      label: "Revise plan",
    });
    plan = await workflow(unit, {
      ...target,
      childThreadId: plan.childThreadId,
      title: "Plan",
      task: PLAN_TASK + "\n\nRevise the previous plan: " + change,
    });
  }
  if (!plan.done || !approved) {
    return { issueKey: brief.issueKey, stoppedAt: "Plan", ...plan, done: false };
  }
  const child = { ...target, childThreadId: plan.childThreadId };

  phase("Build");
  for (const [index, slice] of plan.steps.entries()) {
    const built = await workflow(unit, {
      ...child,
      title: "Build slice",
      task: [
        "Slice " + (index + 1) + " of " + plan.steps.length + ": " + slice,
        "Write a failing test for the slice's behaviour, make it pass with the smallest change,",
        "refactor with the tests green, run lint and the related tests, and commit.",
      ].join("\n"),
    });
    if (!built.done) return { issueKey: brief.issueKey, stoppedAt: "Build", ...built };
  }

  phase("Verify");
  const verified = await workflow(unit, { ...child, title: "Verify", preset: "verify" });
  if (!verified.done) return { issueKey: brief.issueKey, stoppedAt: "Verify", ...verified };

  phase("Hand off");
  const pr = await workflow(unit, {
    ...child,
    title: "Draft PR",
    preset: "draft-pr",
    evidence: [plan.summary, ...verified.evidence, "Check it: " + (verified.url || "-")].join("\n"),
  });
  const declined = !pr.done && pr.blocker.length === 0;
  return { issueKey: brief.issueKey, ...(declined ? verified : pr) };
}
