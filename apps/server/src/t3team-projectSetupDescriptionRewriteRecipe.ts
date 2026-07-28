/**
 * The `describe-rewrite` bundled recipe's workflow body — the ONE implementation behind every
 * "rewrite this description" entry point.
 *
 * SHAPE (Epic 25 engine format, not the retired `export const steps` union):
 *   1. `thread.askUser` — a DETERMINISTIC gate, but ONLY when the caller arrived with nothing. No
 *      model runs before the human has said what should change; attaching a note and submitting IS
 *      that statement, so re-confirming it would cost a click and gather nothing. With intent
 *      supplied this step does not exist.
 *   2. `thread.askAgent` — the writer turn, ON THE LAUNCH THREAD. Never `agent()`/`spawnThread()`:
 *      a workflow child thread is created with no tool context and is invisible to the user, so a
 *      draft proposed there would reach nobody (see t3team-workflowChildPlacement.ts).
 *   3. the BODY calls `t3team.work_item.description.draft_update`. The agent only writes PROSE —
 *      it never touches the tool — so "exactly one draft, always reviewed" is a property of the
 *      engine rather than of prompt obedience.
 *
 * WHY THE WRITER PROMPT IS AUTHORED HERE
 * The web control this backs used to build its own prompt telling the agent to CALL the draft tool
 * itself; that builder was deleted when the control moved onto this workflow, because here the
 * BODY owns the call and an agent that also called it would produce two drafts for one rewrite.
 * The writer's contract is "return prose, touch nothing", and it lives with the body that enforces it.
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
  // Exactly the phase() titles the body declares, in order. A strip that names a phase the body
  // never declares ("Confirm") puts the run's steps under a group the card cannot match.
  phases: [{ title: "Ask" }, { title: "Write" }, { title: "Propose" }],
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

  // Anchored comments and free-form instructions are the same thing to the writer: targeted
  // intent. Quoting the passage is what makes a note actionable rather than a vague preference.
  const anchored = (input.comments ?? []).filter((entry) => trimmed(entry.body).length > 0);
  const requested = [
    trimmed(input.instructions),
    // A note on the whole field carries no quote. Prefixing it anyway would put a fabricated
    // 'On "": ...' on the user's own confirmation card, so an unquoted note stands alone.
    ...anchored.map((entry) => {
      const quote = trimmed(entry.quote);
      const body = trimmed(entry.body);
      return quote.length === 0 ? body : 'On "' + quote + '": ' + body;
    }),
  ].filter((line) => line.length > 0);

  // The ask exists to stop a model turn before the human has said what they want. Attaching a note and
  // submitting IS that statement, so asking again would cost a click and gather nothing. We only ask
  // when we arrived with nothing.
  let intent = requested.join("\\n");
  if (requested.length === 0) {
    phase("Ask");
    intent = trimmed(
      await thread.askUser(
        "What should change in the description of " + input.issueIdOrKey + "?",
        { label: "Rewrite scope" },
      ),
    );
  }

  phase("Write");
  const current = trimmed(input.currentBody);
  const title = trimmed(input.summary);
  // Where this item is mirrored on disk. The sync writes one file per work item, its name the key
  // lowercased with every run of non-alphanumerics collapsed to a dash (NXAI-6 -> nxai-6.json).
  const contextFile = ".t3team/context/work-items/" + input.issueIdOrKey.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json";
  const writerPrompt = [
    "Rewrite the description of " + input.issueIdOrKey + (title.length > 0 ? " (" + title + ")" : "") + ".",
    "",
    current.length > 0 ? "Current description:\\n" + current : "It has no description yet.",
    "",
    intent.length > 0 ? "Requested changes:\\n" + intent : "No specific changes were named; improve clarity and structure.",
    "",
    "Before writing, READ this item from the workspace context mirror. The work tracker is mirrored to",
    "disk, so this is a file read, not an API call. Start at " + contextFile + ", relative to the",
    "workspace root you are running in; .t3team/context/work-items/index.json maps every key to its",
    "file if that path is missing.",
    "",
    "That file carries the ticket itself plus summaryItems and an availability field. When availability",
    "is not 'full', the parent or epic, the children, the comments and the links are NOT in it: they",
    "live under the directory named by fullBundleRootRelativePath, whose entry point is the file named",
    "by ticketEntryPointRelativePath. Read those when they exist. When they do not, write from the",
    "summary and the current description alone and invent nothing — no parent, child, decision or",
    "acceptance criterion you have not actually read.",
    "",
    "A description written from the key and summary alone reads like filler; the point is to say what",
    "THIS item is, in its actual context.",
    "",
    "Then reply with the rewritten description and NOTHING else — no preamble, no commentary, no code",
    "fences. Do not EDIT anything: this workflow proposes your text as a draft a human reviews and",
    "accepts, so your final message must be the description itself.",
  ].join("\\n");

  // A template literal, not concatenation: the static shape scan can read the leading text out of
  // one, so the live card matches this runtime step to its authored plan row instead of filing it
  // under the previous phase as unplanned work.
  const rewritten = trimmed(await thread.askAgent(writerPrompt, { label: \`Rewrite the description of \${input.issueIdOrKey}\` }));
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
