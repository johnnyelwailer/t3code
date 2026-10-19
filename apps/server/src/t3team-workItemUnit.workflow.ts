/**
 * One verifiable unit of work-item delivery, shared by the `fix-this-bug` and `implement-this`
 * bundled recipes. Scaffolded beside each of their `workflow.ts` as `unit.workflow.ts`.
 *
 * The launch thread's agent runs the unit through a coding child: the first unit delegates a new
 * child in its own worktree of the target repository, every later unit continues that child, so
 * one branch carries the whole change. A blocked unit asks the user once and retries with the
 * answer before it gives up.
 *
 * The `draft-pr` preset asks before it publishes, so no recipe can open a pull request the user
 * did not agree to. A declined ask returns `done: false` with an empty `blocker`.
 */
import { Schema } from "effect";
import { getArgs, getThread } from "@t3team/sdk";

export const Inputs = Schema.Struct({
  issueKey: Schema.String,
  repository: Schema.String,
  baseRef: Schema.String,
  title: Schema.String,
  task: Schema.optional(Schema.String),
  preset: Schema.optional(Schema.Literals(["verify", "draft-pr"])),
  brief: Schema.optional(Schema.String),
  evidence: Schema.optional(Schema.String),
  childThreadId: Schema.optional(Schema.String),
});

export const Outputs = Schema.Struct({
  done: Schema.Boolean,
  summary: Schema.String,
  childThreadId: Schema.String,
  branch: Schema.String,
  worktreePath: Schema.String,
  evidence: Schema.Array(Schema.String),
  steps: Schema.Array(Schema.String),
  url: Schema.String,
  blocker: Schema.String,
});

export const meta = {
  name: "work-item.unit",
  description: "Run one verifiable unit in a coding child's own worktree.",
  inputs: Inputs,
  outputs: Outputs,
  capabilities: ["user"],
} as const;

const decodeInputs = Schema.decodeUnknownSync(Inputs);

type UnitInput = typeof Inputs.Type;

const CHILD_RULES = [
  "Rules for the coding child:",
  "- If the workspace or repository ships a work-item skill (for example ies-work-item), run it",
  "  for this unit. The user already answered its analysis and go-ahead gates; treat the brief",
  "  as those answers instead of asking again.",
  "- Prove it works against the real artifact: run the code, the tests or the app, never only read it.",
  "- Fix root causes: trace a defect to the first point where it goes wrong.",
  "- Test behaviour, not implementation. A test must fail before the change and pass after it.",
  "- Keep the diff minimal and inside the unit; no unrelated refactoring.",
  "- Commit the unit on your branch. Never push, open a pull request or request reviewers",
  "  unless the unit says so.",
  "- When behaviour or scope is unclear, stop and report the blocker instead of guessing.",
].join("\n");

const VERIFY_TASK = [
  "Verify the whole change on your branch: run the repository's lint, tests and build, then start",
  "the app on a free port and check the changed behaviour in it the way a user would. Self-review",
  "the diff against the brief and fix what you find. Leave the app running and put the URL to",
  "check it in url.",
].join("\n");

function draftPrTask(input: UnitInput): string {
  return [
    "Push your branch and open a DRAFT pull request against " + input.baseRef + ".",
    "Draft only: never mark it ready and never request or assign reviewers.",
    "Title it with " + input.issueKey + " and a plain summary; describe the problem, the fix and",
    "the evidence. Link it to this thread with link_pull_request. Put its URL in url.",
  ].join("\n");
}

function taskText(input: UnitInput): string {
  if (input.preset === "verify") return VERIFY_TASK;
  if (input.preset === "draft-pr") return draftPrTask(input);
  return input.task ?? "";
}

function routeLine(input: UnitInput): string {
  if (input.childThreadId !== undefined && input.childThreadId.length > 0) {
    return [
      "Send this unit to the coding child thread " + input.childThreadId + " with t3_thread_send,",
      "then wait with t3_thread_wait until its turn settles.",
    ].join("\n");
  }
  return [
    "Delegate this unit with delegate_task: workspace { isolation: 'worktree', repository: '" +
      input.repository +
      "', baseRef: '" +
      input.baseRef +
      "' }, mode 'wait', timeoutMs 3600000.",
    "If the wait times out, keep checking task_status until the task is terminal.",
    "Put the rules and the brief below into the delegated task so the child can work on its own.",
  ].join("\n");
}

function unitPrompt(input: UnitInput, guidance: string): string {
  return [
    routeLine(input),
    "",
    input.title + " for " + input.issueKey + ":",
    taskText(input),
    guidance.length > 0 ? "\nUser guidance on the last blocker:\n" + guidance : "",
    input.brief !== undefined && input.brief.length > 0 ? "\nBrief:\n" + input.brief : "",
    "",
    CHILD_RULES,
    "",
    "Return exactly one JSON object with the child's result: done (the unit is finished and",
    "verified), summary, childThreadId, branch, worktreePath, evidence (commands run with their",
    "outcome, test names, screenshots or URLs), steps (ordered follow-up units when the unit asks",
    "for them, else empty), url (a link to check the result, else empty) and blocker (why it is",
    "not done, else empty). Report what the child actually did; do not do its work yourself.",
  ].join("\n");
}

function declined(input: UnitInput): typeof Outputs.Type {
  return {
    done: false,
    summary: "No pull request opened for " + input.issueKey + ".",
    childThreadId: input.childThreadId ?? "",
    branch: "",
    worktreePath: "",
    evidence: [],
    steps: [],
    url: "",
    blocker: "",
  };
}

export default async function run() {
  const input = decodeInputs(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error(
      "A work-item unit needs the chat it was launched from; it cannot run headless.",
    );
  }

  if (input.preset === "draft-pr") {
    const question = ["Open a draft PR for " + input.issueKey + "?", "", input.evidence ?? ""];
    const open = await thread.askUser(question.join("\n"), {
      label: "Draft PR",
      schema: Schema.Boolean,
      labels: { true: "Open draft PR", false: "Not now" },
    });
    if (!open) return declined(input);
  }

  const first = await thread.askAgent(unitPrompt(input, ""), {
    label: `${input.title}`,
    schema: Outputs,
  });
  if (first.done) return first;

  const blocked = [
    input.title + " is blocked: " + first.blocker,
    "How should it continue? Leave empty to stop.",
  ];
  const guidance = await thread.askUser(blocked.join("\n"), { label: "Unblock" });
  if (guidance.trim().length === 0) return first;

  const continued =
    first.childThreadId.length > 0 ? { ...input, childThreadId: first.childThreadId } : input;
  return await thread.askAgent(unitPrompt(continued, guidance.trim()), {
    label: `${input.title}`,
    schema: Outputs,
  });
}
