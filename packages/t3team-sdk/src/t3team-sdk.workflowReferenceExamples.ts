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
    title: "Durable routine",
    when: "Work that must wake itself on a schedule; the loop is the schedule, waitUntil parks the run.",
    source: `import { agent, getThread, now, waitUntil } from "@t3team/sdk";

export const meta = {
  name: "daily-check",
  description: "Once a day for a week, check the state and report only actionable changes.",
  capabilities: ["schedule", "user"],
} as const;

const DAY = 24 * 60 * 60 * 1000;

export default async function run() {
  const thread = getThread();
  if (thread === undefined) throw new Error("daily-check needs a launch thread");
  for (let day = 1; day <= 7; day += 1) {
    await waitUntil(now() + DAY);
    const report = await agent("Check the current state and report only actionable changes.", {
      label: "Daily check",
      capabilities: "inherit",
    });
    thread.notifyUser(report);
  }
  return { days: 7 };
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
