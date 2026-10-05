/**
 * The examples the generated author reference ships. They are the ONLY hand-written part of that
 * reference, and every one of them is run through the real static audit (with the type checker),
 * the loader and V8's compile step in `t3team-sdk.workflowReference.test.ts` — and through the
 * server's full launch check in `apps/server` — so the reference can never teach a shape the
 * runtime rejects. Add an example here, never inline in the reference text.
 */

export interface WorkflowReferenceExample {
  readonly title: string;
  /** One line: when an author should reach for this shape. */
  readonly when: string;
  readonly source: string;
}

export const WORKFLOW_REFERENCE_EXAMPLES: ReadonlyArray<WorkflowReferenceExample> = [
  {
    title: "Fan out, then synthesize",
    when: "Several independent angles on one input, merged into one ranked result.",
    source: `import { Schema } from "effect";
import { agent, getArgs, parallel, phase } from "@t3team/sdk";

const Inputs = Schema.Struct({ change: Schema.String });
const Findings = Schema.Struct({ findings: Schema.Array(Schema.String) });

export const meta = {
  name: "review-change",
  description: "Review a change from three angles in parallel, then rank the findings.",
  inputs: Inputs,
  phases: [{ title: "Review" }, { title: "Synthesize" }],
} as const;

export default async function run() {
  const { change } = Schema.decodeUnknownSync(Inputs)(getArgs());
  phase("Review");
  const reviews = await parallel(
    ["correctness", "security", "performance"].map(
      (angle) => () =>
        agent(\`Review this change for \${angle} issues:\\n\${change}\`, {
          label: \`Review \${angle}\`,
          capabilities: "inherit",
          schema: Findings,
        }),
    ),
  );
  phase("Synthesize");
  const merged = reviews.flatMap((review) => review?.findings ?? []);
  return await agent(\`Rank these findings by severity:\\n\${merged.join("\\n")}\`, {
    label: "Rank findings",
    capabilities: "inherit",
  });
}
`,
  },
  {
    title: "Durable routine that keeps the launch thread working",
    when: "Work that must wake itself on a schedule and continue in the user's own thread. The loop is the schedule; waitUntil parks the run (survives restarts, catches up when overdue); each wake drives a TURN on the launch thread via thread.askAgent — agent()/spawnThread() would do the work elsewhere and leave that thread idle. The turn re-reads its plan from a durable place and the loop ends on a real condition.",
    source: `import { Schema } from "effect";
import { getArgs, getThread, now, waitUntil } from "@t3team/sdk";

const Inputs = Schema.Struct({ planPath: Schema.String, maxWakes: Schema.Number });
const Progress = Schema.Struct({ done: Schema.Boolean, summary: Schema.String });

export const meta = {
  name: "keep-working",
  description: "Every 20 minutes, continue the standing goal in the launch thread until it is done.",
  inputs: Inputs,
  capabilities: ["schedule", "user"],
} as const;

const MINUTE = 60 * 1000;

export default async function run() {
  const { planPath, maxWakes } = Schema.decodeUnknownSync(Inputs)(getArgs());
  const thread = getThread();
  if (thread === undefined) throw new Error("keep-working needs a launch thread");
  for (let wake = 1; wake <= maxWakes; wake += 1) {
    await waitUntil(now() + 20 * MINUTE);
    const progress = await thread.askAgent(
      \`Re-read the plan at \${planPath}, do the next item, update the plan, and report {done, summary}.\`,
      { label: "Heartbeat", schema: Progress },
    );
    if (progress.done) {
      thread.notifyUser(\`Standing goal finished: \${progress.summary}\`);
      return { wakes: wake, summary: progress.summary };
    }
  }
  return { wakes: maxWakes, summary: "wake budget exhausted" };
}
`,
  },
  {
    title: "Show evidence, then ask the user",
    when: "A human decision; render what it depends on first, then a typed choice.",
    source: `import { Schema } from "effect";
import { agent, getThread } from "@t3team/sdk";

export const meta = {
  name: "approve-plan",
  description: "Draft a plan, show it, and ask whether to proceed.",
  capabilities: ["user"],
} as const;

const Choice = Schema.Literals(["approve", "revise"]);

export default async function run() {
  const thread = getThread();
  if (thread === undefined) throw new Error("approve-plan needs a launch thread");
  const plan = await agent("Draft a short plan for the task.", {
    label: "Draft plan",
    capabilities: "inherit",
  });
  thread.showWidget({ title: "Plan", widgetCode: \`<pre>\${plan}</pre>\`, format: "html" });
  const choice = await thread.askUser("Approve this plan?", { schema: Choice, label: "Approve plan" });
  return { choice };
}
`,
  },
];
