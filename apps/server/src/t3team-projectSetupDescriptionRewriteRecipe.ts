/**
 * The `describe-rewrite` bundled recipe's workflow body — the ONE implementation behind every
 * "rewrite this description" entry point.
 *
 * SHAPE (Epic 25 engine format, not the retired `export const steps` union):
 *   1. `thread.askUser` — a DETERMINISTIC gate. No model runs before the human has said what
 *      should change. When the caller already supplied intent (anchored comments and/or free-form
 *      instructions) the card CONFIRMS that list instead of asking from scratch — one step,
 *      pre-filled, never a second code path.
 *   2. `thread.askAgent` — the writer turn, ON THE LAUNCH THREAD. Never `agent()`/`spawnThread()`:
 *      a workflow child thread is created with no tool context and is invisible to the user, so a
 *      draft proposed there would reach nobody (see t3team-workflowChildPlacement.ts).
 *   3. the BODY calls `t3team.work_item.description.draft_update`. The agent only writes PROSE —
 *      it never touches the tool — so "exactly one draft, always reviewed" is a property of the
 *      engine rather than of prompt obedience.
 *
 * WHY THE WRITER PROMPT IS NOT `buildWorkItemAgentRewritePrompt`
 * That builder (apps/web/.../t3team-workItemAgentRewritePrompt.ts) tells the agent to CALL the
 * draft tool itself — correct for the chat-turn control it serves, and exactly wrong here, where
 * the body owns the call. Sharing it would produce two drafts. The contracts differ, so the text
 * differs; this is a different prompt, not a second copy of that one.
 *
 * WHY THIS IS A RENDERED STRING
 * Bundled recipes reach a user's disk through project-setup scaffolding
 * (`renderBundledRecipeSetupFiles`), the same way `create-recipe` and `edit-plugin-module` ship
 * their `workflow.ts`. The packed server has no source tree to read from, so the body is authored
 * here and written out at setup. Its companion test EXECUTES this exact string through the real
 * engine, which is what keeps an unchecked string honest.
 *
 * @module t3team-projectSetupDescriptionRewriteRecipe
 */

import {
  T3TEAM_PROJECT_RECIPES_ROOT,
  type T3TeamProjectSetupFile,
} from "./t3team-projectSetupShared.ts";

export const DESCRIPTION_REWRITE_RECIPE_ID = "describe-rewrite";

/** This recipe's scaffolded extras — empty for every other bundled recipe. */
export function descriptionRewriteSetupFiles(
  recipeId: string,
): ReadonlyArray<T3TeamProjectSetupFile> {
  if (recipeId !== DESCRIPTION_REWRITE_RECIPE_ID) return [];
  return [
    {
      relativePath: `${T3TEAM_PROJECT_RECIPES_ROOT}/${recipeId}/workflow.ts`,
      contents: renderDescriptionRewriteWorkflow(),
      writeMode: "if-missing",
    },
  ];
}

/** The scaffolded `workflow.ts` for {@link DESCRIPTION_REWRITE_RECIPE_ID}. */
export function renderDescriptionRewriteWorkflow(): string {
  return `import { Schema } from "effect";
import { getArgs, getThread, getTools, log, phase } from "@t3team/sdk";

/** Anchored feedback from the diff reviewer: the quoted passage plus the note left on it. */
const Comment = Schema.Struct({
  blockId: Schema.String,
  quote: Schema.String,
  body: Schema.String,
});

export const Inputs = Schema.Struct({
  issueIdOrKey: Schema.String,
  summary: Schema.optional(Schema.String),
  currentBody: Schema.optional(Schema.String),
  instructions: Schema.optional(Schema.String),
  comments: Schema.optional(Schema.Array(Comment)),
});

export const meta = {
  name: "work-item.description-rewrite",
  description: "Rewrite a work item description and propose it as a reviewable draft.",
  inputs: Inputs,
  phases: [{ title: "Confirm" }, { title: "Write" }, { title: "Propose" }],
  capabilities: ["user", "mutation.draft"],
} as const;

function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function run() {
  const input = Schema.decodeSync(Inputs)(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error("describe-rewrite needs the chat it was launched from; it cannot run headless.");
  }

  phase("Confirm");
  // Anchored comments and free-form instructions are the same thing to the writer: targeted
  // intent. Quoting the passage is what makes a note actionable rather than a vague preference.
  const anchored = (input.comments ?? []).filter((entry) => trimmed(entry.body).length > 0);
  const requested = [
    trimmed(input.instructions),
    ...anchored.map((entry) => 'On "' + trimmed(entry.quote) + '": ' + trimmed(entry.body)),
  ].filter((line) => line.length > 0);

  const question =
    requested.length > 0
      ? "Rewrite the description of " +
        input.issueIdOrKey +
        " with these changes?\\n\\n" +
        requested.join("\\n") +
        "\\n\\nConfirm, or reply with what to do instead."
      : "What should change in the description of " + input.issueIdOrKey + "?";

  const answer = trimmed(await thread.askUser(question, { label: "Rewrite scope" }));
  // A bare confirmation keeps the pre-filled list; anything else REPLACES it, so the human always
  // has the last word on intent.
  const confirmations = ["", "y", "yes", "ok", "okay", "confirm", "confirmed", "go", "do it"];
  const intent =
    confirmations.indexOf(answer.toLowerCase()) === -1 && answer.length > 0
      ? answer
      : requested.join("\\n");

  phase("Write");
  const current = trimmed(input.currentBody);
  const title = trimmed(input.summary);
  const writerPrompt = [
    "Rewrite the description of " + input.issueIdOrKey + (title.length > 0 ? " (" + title + ")" : "") + ".",
    "",
    current.length > 0 ? "Current description:\\n" + current : "It has no description yet.",
    "",
    intent.length > 0 ? "Requested changes:\\n" + intent : "No specific changes were named; improve clarity and structure.",
    "",
    "Reply with the rewritten description and NOTHING else — no preamble, no commentary, no code",
    "fences. Do not call any tool and do not edit anything: this workflow proposes your text as a",
    "draft that a human reviews and accepts.",
  ].join("\\n");

  const rewritten = trimmed(await thread.askAgent(writerPrompt, { label: "Rewrite " + input.issueIdOrKey }));
  if (rewritten.length === 0) {
    throw new Error("The writer returned no description text, so there is nothing to propose.");
  }

  phase("Propose");
  // The ENGINE calls the draft tool; the proposal lands on this thread's review surface.
  await getTools().t3team.workItem.description.draftUpdate({
    issue_id: input.issueIdOrKey,
    body: rewritten,
  });
  log("Proposed a description draft for " + input.issueIdOrKey + " for review.");

  return { issueIdOrKey: input.issueIdOrKey, proposed: true };
}
`;
}
