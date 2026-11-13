/**
 * The orchestration author's COMPACT reference: the surface nearly every orchestration needs, one
 * line per name, plus a template and the tested examples. The full generated reference
 * (`t3team-sdk.workflowReference.generated.ts`, ~40 KB) stays for the context-free repair path.
 *
 * Why a second, smaller text: the author used to get the full reference in its kickoff (45-60 KB).
 * The Nexplore conductor tier shares one 16k-token budget between reasoning and answer, and on
 * that prompt it reasoned ~65 KB and ended without a single tool call (runs 0315658c, 7579e37a,
 * 822ef5ab). Anything not listed here is still bound, and the validator's type errors name the
 * exact signature, so the author learns the long tail from the checker rather than up front.
 *
 * `t3team-sdk.workflowEssentials.test.ts` proves every name below is bound and that the template
 * passes the full static audit.
 */
import { WORKFLOW_REFERENCE_EXAMPLES } from "./t3team-sdk.workflowReferenceExamples.ts";

/** Bound names this text documents; each must exist in the body's global bindings. */
export const WORKFLOW_ESSENTIAL_NAMES = [
  "agent",
  "parallel",
  "pipeline",
  "phase",
  "log",
  "getArgs",
  "getThread",
  "spawnThread",
  "now",
  "wait",
  "waitUntil",
  "retry",
  "getSignalSource",
  "waitForAny",
] as const;

export const WORKFLOW_AUTHOR_TEMPLATE = `import { Schema } from "effect";
import { agent, getArgs, phase } from "@t3team/sdk";

const Inputs = Schema.Struct({ target: Schema.String });
const Report = Schema.Struct({ ok: Schema.Boolean, summary: Schema.String });

export const meta = {
  name: "do-the-thing",
  description: "One sentence: what this run does.",
  inputs: Inputs,
  phases: [{ title: "Work" }],
} as const;

export default async function run() {
  const { target } = Schema.decodeUnknownSync(Inputs)(getArgs());
  phase("Work");
  const report = await agent(\`Do the work on \${target}. Answer with ok and a one-line summary.\`, {
    label: "Do the work",
    capabilities: "inherit",
    schema: Report,
  });
  return { ok: report.ok, summary: report.summary };
}
`;

const API = `## API — import from "@t3team/sdk" (Schema from "effect"); nothing else exists
- agent(prompt, { label, capabilities: "inherit", schema?, model?, effort?, attachments? }) → the
  decoded \`schema\` value (else a string). One child agent with its own tools (shell, files). It sees
  ONLY its prompt and attachments, so make the prompt self-contained. Keep a schema small and name
  its fields in the prompt ("answer with ok and summary"), or the child misses the shape.
- parallel([() => agent(…), …], { concurrency? }) → results in input order; a failed branch is null.
- pipeline(items, (prev, item, index) => …, …more stages, { concurrency? }) → one chain per item.
- phase(title) / log(text) → progress on the run card. Use the titles in meta.phases.
- getArgs() → the launch args as unknown; decode: Schema.decodeUnknownSync(Inputs)(getArgs()).
- getThread() → the launch thread, or undefined when headless. Its verbs:
  askUser(question, { schema?, label? }) parks until the user answers ("user");
  notifyUser(line) and showWidget({ title, widgetCode, format: "html" }) ("user");
  askAgent(prompt, { label, schema? }) runs a turn in the user's own thread.
- spawnThread({ capabilities: "inherit", name?, model? }) → a thread you drive with askAgent.
- now() → journaled epoch ms. wait(ms) / waitUntil(epochMs) → durable timers that survive restarts
  ("schedule"). A recurring job is a loop around waitUntil, ended by a real condition.
- retry((attempt) => …, { maxAttempts, backoff: (attempt) => ms }) → durable retries ("schedule").
- getSignalSource(Source, params) + waitForAny([handle.on(Signal, { key })]) → wait for repository
  or work-item events ("source:<name>"). Polling with waitUntil + agent is fine too.
- effort: "light" | "standard" | "high". model: "<instanceId>" or "<instanceId>/<slug>" from the
  catalog above only; omit it to use the run's own model.`;

const RULES = `## Rules the validator enforces
- Shape: imports, module-level consts (schemas), then \`export const meta = {…} as const\`, then
  \`export default async function run() {…}\` returning a plain object. meta is a literal.
- meta.capabilities lists what the body uses: "schedule" (wait/waitUntil/retry), "user"
  (askUser/notifyUser/showWidget), "source:<name>" (signals). Omit it when nothing needs one.
- No Node or browser APIs (fs, path, process, fetch, setTimeout, require): agents do the I/O.
  No module-level \`let\`.
- In-memory variables restart from their initial value on resume; durable progress lives in the
  journal (agent results, wait, checkpoint) or in files an agent writes.
- Windows paths: pass them through args, never as string literals in the source. If you must write
  one, double every backslash ("C:\\\\Users\\\\me").
- Never catch and swallow errors from agent/askUser/wait: they park the run, they are not failures.
- Types: a schema is a value, so its type is \`typeof Report.Type\`, never \`Report\`. Decoded
  arrays are readonly: type parameters as \`ReadonlyArray<T>\`. Await agent() before reading fields.
  Schema helpers are lowercase where they wrap a field: Schema.optional(Schema.String).

## Reporting
Return the verdict as a small object ({ ok, summary, items }). Show tables or evidence with
getThread()?.showWidget (needs "user") using host theme variables (var(--background),
var(--success)), never hex colours. Compose a summary; never forward an agent's raw output.`;

/** The compact reference text for the author's kickoff. */
export const WORKFLOW_AUTHOR_ESSENTIALS = [
  `## Template — start here\n\`\`\`ts\n${WORKFLOW_AUTHOR_TEMPLATE}\`\`\``,
  API,
  RULES,
  "## Examples (all pass the validator)",
  ...WORKFLOW_REFERENCE_EXAMPLES.map(
    (example) => `### ${example.title}\n${example.when}\n\`\`\`ts\n${example.source}\`\`\``,
  ),
].join("\n\n");
