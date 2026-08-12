/**
 * The `describe-rewrite` bundled recipe: rewrite a work item's description and propose the result
 * as a draft a human reviews. Scaffolded into `.t3team/recipes/describe-rewrite/workflow.ts`.
 *
 * The agent only writes PROSE — the BODY makes the single draft call, so "exactly one draft,
 * always reviewed" is a property of the workflow rather than of prompt obedience.
 */
import { Schema } from "effect";
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

/** Compiled once: the decoder is rebuilt on every call when it is left inline. */
const decodeInputs = Schema.decodeUnknownSync(Inputs);

/** The only value the writer is allowed to return. Keeping this typed prevents prose preambles from
 * becoming part of the description draft. */
const RewriteResult = Schema.Struct({
  description: Schema.String,
});

/** Just the one branch of the run's resolved tool tree this body reaches into. */
interface DraftTools {
  readonly t3team: {
    readonly workItem: {
      readonly description: {
        draftUpdate(args: { readonly issue_id: string; readonly body: string }): Promise<unknown>;
      };
    };
  };
}

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default async function run() {
  const input = decodeInputs(getArgs());
  const thread = getThread();
  if (thread === undefined) {
    throw new Error(
      "describe-rewrite needs the chat it was launched from; it cannot run headless.",
    );
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
  let intent = requested.join("\n");
  if (requested.length === 0) {
    phase("Ask");
    intent = trimmed(
      await thread.askUser("What should change in the description of " + input.issueIdOrKey + "?", {
        label: "Rewrite scope",
      }),
    );
  }

  phase("Write");
  const current = trimmed(input.currentBody);
  const title = trimmed(input.summary);
  // Where this item is mirrored on disk. The sync writes one file per work item, its name the key
  // lowercased with every run of non-alphanumerics collapsed to a dash (NXAI-6 -> nxai-6.json).
  const contextFile =
    ".t3team/context/work-items/" +
    input.issueIdOrKey.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
    ".json";
  const writerPrompt = [
    "Rewrite the description of " +
      input.issueIdOrKey +
      (title.length > 0 ? " (" + title + ")" : "") +
      ".",
    "",
    current.length > 0 ? "Current description:\n" + current : "It has no description yet.",
    "",
    intent.length > 0
      ? "Requested changes:\n" + intent
      : "No specific changes were named; improve clarity and structure.",
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
    "Return exactly one JSON object with one key: description.",
    "The description value must contain only the final rewritten description. Do not put a preamble,",
    "commentary, explanation, or code fences in that value. Do not EDIT anything: this workflow",
    "proposes your text as a draft a human reviews and accepts.",
  ].join("\n");

  // A template literal, not concatenation: the static shape scan can read the leading text out of
  // one, so the live card matches this runtime step to its authored plan row instead of filing it
  // under the previous phase as unplanned work.
  const rewrittenResult = await thread.askAgent(writerPrompt, {
    label: `Rewrite the description of ${input.issueIdOrKey}`,
    schema: RewriteResult,
  });
  const rewritten = trimmed(rewrittenResult.description);
  if (rewritten.length === 0) {
    throw new Error("The writer returned no description text, so there is nothing to propose.");
  }

  phase("Propose");
  // The ENGINE calls the draft tool; the proposal lands on this thread's review surface.
  await getTools<DraftTools>().t3team.workItem.description.draftUpdate({
    issue_id: input.issueIdOrKey,
    body: rewritten,
  });
  log("Proposed a description draft for " + input.issueIdOrKey + " for review.");

  // `summary` is what the completion message shows the human; the raw fields would otherwise be
  // auto-formatted into "Issue Id Or Key: … Proposed: true", which means nothing to a user.
  return {
    issueIdOrKey: input.issueIdOrKey,
    proposed: true,
    summary:
      "Proposed a rewritten description for " +
      input.issueIdOrKey +
      " — review it on the work item and accept or dismiss it there.",
  };
}
