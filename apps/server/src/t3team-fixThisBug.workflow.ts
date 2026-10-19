/**
 * The `fix-this-bug` bundled recipe: understand a bug, confirm its behaviour with the user, then
 * reproduce, fix and verify it in a coding child's own worktree, and offer a draft pull request.
 * Scaffolded into `.t3team/recipes/fix-this-bug/workflow.ts` beside the shared `unit.workflow.ts`.
 *
 * No code is scanned before the user answered the behaviour questions, and nothing is fixed
 * before a failing test or runtime evidence shows the bug.
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
  name: "work-item.fix-this-bug",
  description: "Reproduce, fix and verify a bug, then offer a draft pull request.",
  inputs: Inputs,
  phases: [
    { title: "Understand" },
    { title: "Clarify" },
    { title: "Reproduce" },
    { title: "Fix" },
    { title: "Verify" },
    { title: "Hand off" },
  ],
  capabilities: ["user"],
} as const;

const decodeInputs = Schema.decodeUnknownSync(Inputs);

const BugBrief = Schema.Struct({
  issueKey: Schema.String,
  title: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
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
      ? "Read the bug " + named + "."
      : "Find the bug this thread was started for (its linked work item) and read it.",
    "Read it from the workspace context mirror, a file read rather than an API call:",
    ".t3team/context/work-items/index.json maps each key to its file. Read the description, the",
    "repro steps, every attachment and the comments.",
    input.instructions !== undefined && input.instructions.length > 0
      ? "The user added: " + input.instructions
      : "",
    "Do not scan any code yet and do not guess the root cause.",
    "",
    "Return exactly one JSON object: issueKey, title, expected, actual (as the ticket states them,",
    "empty when it does not), suspectedRepository (owner/name of the linked repository the bug",
    "most likely lives in), baseRef (that repository's default branch unless the ticket names a",
    "release or support branch) and questions: the open behaviour questions. Cover expected and",
    "actual behaviour, scope, regression, trigger, related changes and workaround, but only ask",
    "what the ticket does not already answer.",
  ].join("\n");
}

function checkpointQuestion(brief: typeof BugBrief.Type): string {
  return [
    "Before any code scan on " + brief.issueKey + ", please confirm:",
    ...brief.questions.map((question, index) => index + 1 + ". " + question),
    "",
    "Expected: " + (brief.expected || "unclear"),
    "Actual: " + (brief.actual || "unclear"),
    "Target: " + brief.suspectedRepository + " from " + brief.baseRef + ". Change it if needed.",
  ].join("\n");
}

export default async function run() {
  const input = decodeInputs(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error("fix-this-bug needs the chat it was launched from; it cannot run headless.");
  }
  const unit = defineWorkflow<typeof Unit>("./t3team-workItemUnit.workflow.ts");

  phase("Understand");
  const brief = await thread.askAgent(understandPrompt(input), {
    label: `Read the bug`,
    schema: BugBrief,
  });

  phase("Clarify");
  const checkpoint = await thread.askUser(checkpointQuestion(brief), {
    label: "Bug analysis",
    schema: Checkpoint,
  });
  const target = {
    issueKey: brief.issueKey,
    repository: checkpoint.repository || brief.suspectedRepository,
    baseRef: checkpoint.baseRef || brief.baseRef,
    brief: [
      brief.title,
      "Expected: " + brief.expected,
      "Actual: " + brief.actual,
      "Confirmed by the user: " + checkpoint.answers,
    ].join("\n"),
  };

  phase("Reproduce");
  const repro = await workflow(unit, {
    ...target,
    title: "Reproduce",
    task: [
      "Reproduce the bug before changing any production code: write a test that fails for the",
      "confirmed reason, or capture runtime evidence when no test can reach it. Commit the failing",
      "test. If it does not reproduce, report that as the blocker with what you tried.",
    ].join("\n"),
  });
  if (!repro.done) return { issueKey: brief.issueKey, stoppedAt: "Reproduce", ...repro };
  const child = { ...target, childThreadId: repro.childThreadId };

  phase("Fix");
  const fix = await workflow(unit, {
    ...child,
    title: "Fix",
    task: [
      "Trace the failure to the first point where behaviour goes wrong and state that root cause",
      "in one sentence. Make the minimal fix there, turn the reproduction green, run the related",
      "tests and commit.",
    ].join("\n"),
  });
  if (!fix.done) return { issueKey: brief.issueKey, stoppedAt: "Fix", ...fix };

  phase("Verify");
  const verified = await workflow(unit, { ...child, title: "Verify", preset: "verify" });
  if (!verified.done) return { issueKey: brief.issueKey, stoppedAt: "Verify", ...verified };

  phase("Hand off");
  const pr = await workflow(unit, {
    ...child,
    title: "Draft PR",
    preset: "draft-pr",
    evidence: [fix.summary, ...verified.evidence, "Check it: " + (verified.url || "-")].join("\n"),
  });
  const declined = !pr.done && pr.blocker.length === 0;
  return { issueKey: brief.issueKey, ...(declined ? verified : pr) };
}
