/**
 * Sample data for the PR diff explorer story: five changed files with long unchanged regions
 * between hunks. The unified patch is derived from the full-file contents, so the hunk view and
 * the full-file view always agree.
 */

interface SampleFile {
  readonly path: string;
  readonly oldLines: string[];
  readonly newLines: string[];
}

const filler = (tag: string, from: number, count: number) =>
  Array.from(
    { length: count },
    (_, i) => `  const ${tag}_${from + i} = compute${tag}(${from + i});`,
  );

export const SAMPLE_FILES: SampleFile[] = [
  {
    path: "apps/server/src/workflow/journal.ts",
    oldLines: [
      `import type { AgentResult } from "@t3team/sdk/contract";`,
      `import { randomUUID } from "node:crypto";`,
      ``,
      `export interface WorkflowStepRecord {`,
      `  stepId: string;`,
      `  startedAt: string;`,
      `  payload: AgentResult;`,
      `}`,
      ``,
      ...filler("cfg", 0, 18),
      ``,
      `/** Append a durable record of a step finishing. */`,
      `export async function appendStepRecord(`,
      `  runId: string,`,
      `  record: WorkflowStepRecord,`,
      `) {`,
      `  const key = \`\${runId}:\${record.stepId}\`;`,
      `  await kv.put(key, JSON.stringify(record));`,
      `  return true;`,
      `}`,
      ``,
      ...filler("idx", 0, 14),
      ``,
      `export function stepRecordId(runId: string, stepId: string) {`,
      `  return \`\${runId}:\${stepId}\`;`,
      `}`,
    ],
    newLines: [
      `import type { AgentResult } from "@t3team/sdk/contract";`,
      `import { createPostgresAdapter } from "~/lib/postgres-adapter";`,
      `import { WorkflowJournalSchema } from "@t3team/contracts";`,
      `import { randomUUID } from "node:crypto";`,
      ``,
      `export interface WorkflowStepRecord {`,
      `  stepId: string;`,
      `  startedAt: string;`,
      `  payload: AgentResult;`,
      `}`,
      ``,
      `const adapter = createPostgresAdapter(process.env.DATABASE_URL);`,
      ``,
      ...filler("cfg", 0, 18),
      ``,
      `/** Append a durable record of a step finishing. */`,
      `export async function appendStepRecord(`,
      `  runId: string,`,
      `  record: WorkflowStepRecord,`,
      `) {`,
      `  await adapter.execute(`,
      `    "insert into workflow_journal (run_id, step_id, payload) values ($1, $2, $3) on conflict do nothing",`,
      `    runId,`,
      `    record.stepId,`,
      `    record.payload,`,
      `  );`,
      `  return true;`,
      `}`,
      ``,
      ...filler("idx", 0, 14),
      ``,
      `export function stepRecordId(runId: string, stepId: string) {`,
      `  return \`\${runId}:\${stepId}\`;`,
      `}`,
    ],
  },
  {
    path: "apps/server/src/workflow/qualification.workflow.ts",
    oldLines: [
      `import { pipeline, parallel, step } from "@t3team/sdk/orchestration";`,
      `import type { QualificationInput } from "@t3team/contracts";`,
      `import { fetchManifest, buildPlan, qualifyStream } from "./qualification";`,
      ``,
      ...filler("meta", 0, 14),
      ``,
      `export function qualificationWorkflow(input: QualificationInput) {`,
      `  return pipeline(`,
      `    "qualification",`,
      `    step("fetch-manifest", () => fetchManifest(input.ticketId)),`,
      `    step("plan", async ({ context }) => buildPlan(context.manifest)),`,
      `    parallel("review", ({ context }) =>`,
      `      context.plan.streams.map((stream) =>`,
      `        step(stream.id, () => qualifyStream(stream)),`,
      `      ),`,
      `    ),`,
      `  );`,
      `}`,
      ``,
      ...filler("hook", 0, 12),
      ``,
      `export function isQualificationWorkflow(name: string): boolean {`,
      `  return name === "qualification";`,
      `}`,
    ],
    newLines: [
      `import { pipeline, parallel, step } from "@t3team/sdk/orchestration";`,
      `import type { QualificationInput } from "@t3team/contracts";`,
      `import { fetchManifest, buildPlan, qualifyStream } from "./qualification";`,
      `import { appendStepRecord, stepRecordId } from "./journal";`,
      ``,
      ...filler("meta", 0, 14),
      ``,
      `export function qualificationWorkflow(input: QualificationInput) {`,
      `  return pipeline(`,
      `    "qualification",`,
      `    step("fetch-manifest", async ({ run }) => {`,
      `      const manifest = await fetchManifest(input.ticketId);`,
      `      await appendStepRecord(run.id, {`,
      `        stepId: "fetch-manifest",`,
      `        startedAt: new Date().toISOString(),`,
      `        payload: manifest,`,
      `      });`,
      `      return manifest;`,
      `    }),`,
      `    step("plan", async ({ run, context }) => {`,
      `      const plan = buildPlan(context.manifest);`,
      `      await appendStepRecord(run.id, {`,
      `        stepId: "plan",`,
      `        startedAt: new Date().toISOString(),`,
      `        payload: plan,`,
      `      });`,
      `      return plan;`,
      `    }),`,
      `    parallel("review", ({ context }) =>`,
      `      context.plan.streams.map((stream) =>`,
      `        step(stream.id, ({ run }) =>`,
      `          qualifyStream(run.id, stream),`,
      `        ),`,
      `      ),`,
      `    ),`,
      `  );`,
      `}`,
      ``,
      ...filler("hook", 0, 12),
      ``,
      `export function isQualificationWorkflow(name: string): boolean {`,
      `  return name === "qualification";`,
      `}`,
    ],
  },
  {
    path: "apps/web/src/components/WorkflowRunCard.tsx",
    oldLines: [
      `import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";`,
      `import { useWorkflowRun } from "~/state/workflows";`,
      ``,
      ...filler("style", 0, 10),
      ``,
      `export function WorkflowRunCard({ runId }: { runId: string }) {`,
      `  const run = useWorkflowRun(runId);`,
      `  if (!run) return null;`,
      `  return (`,
      `    <Card>`,
      `      <CardHeader>`,
      `        <CardTitle>{run.title}</CardTitle>`,
      `      </CardHeader>`,
      `      <CardContent>`,
      `        <ol className="space-y-1">`,
      `          {run.steps.map((step) => (`,
      `            <li key={step.id}>{step.name}</li>`,
      `          ))}`,
      `        </ol>`,
      `      </CardContent>`,
      `    </Card>`,
      `  );`,
      `}`,
      ``,
      ...filler("util", 0, 8),
      ``,
      `export function WorkflowRunCardSkeleton() {`,
      `  return <Card aria-busy="true" />;`,
      `}`,
    ],
    newLines: [
      `import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";`,
      `import { useWorkflowRun } from "~/state/workflows";`,
      `import { formatStepElapsed } from "~/lib/format";`,
      `import { cn } from "~/lib/utils";`,
      ``,
      ...filler("style", 0, 10),
      ``,
      `export function WorkflowRunCard({ runId }: { runId: string }) {`,
      `  const run = useWorkflowRun(runId);`,
      `  if (!run) return null;`,
      `  return (`,
      `    <Card>`,
      `      <CardHeader>`,
      `        <CardTitle>{run.title}</CardTitle>`,
      `        <span className={cn("text-xs", run.status === "running" ? "text-amber-500" : "text-muted-foreground")}>`,
      `          {run.status}`,
      `        </span>`,
      `      </CardHeader>`,
      `      <CardContent>`,
      `        <ol className="space-y-1">`,
      `          {run.steps.map((step) => (`,
      `            <li key={step.id} className="flex items-center justify-between text-xs">`,
      `              <span>{step.name}</span>`,
      `              <span className="font-mono text-muted-foreground">`,
      `                {formatStepElapsed(step.startedAt, step.finishedAt)}`,
      `              </span>`,
      `            </li>`,
      `          ))}`,
      `        </ol>`,
      `      </CardContent>`,
      `    </Card>`,
      `  );`,
      `}`,
      ``,
      ...filler("util", 0, 8),
      ``,
      `export function WorkflowRunCardSkeleton() {`,
      `  return <Card aria-busy="true" />;`,
      `}`,
    ],
  },
  {
    path: "packages/contracts/src/workflow.ts",
    oldLines: [
      `import * as Schema from "effect/Schema";`,
      ``,
      ...filler("enum", 0, 12),
      ``,
      `export const WorkflowStatus = Schema.Enum(["accepted", "running", "paused", "suspended", "sleeping", "completed", "failed"]);`,
      ``,
      `export const WorkflowRunView = Schema.Struct({`,
      `  id: Schema.String,`,
      `  title: Schema.String,`,
      `  status: WorkflowStatus,`,
      `  steps: Schema.Array(WorkflowStepView),`,
      `});`,
      ``,
      ...filler("view", 0, 10),
      ``,
      `export type WorkflowRunViewType = Schema.Schema.Type<typeof WorkflowRunView>;`,
    ],
    newLines: [
      `import * as Schema from "effect/Schema";`,
      ``,
      ...filler("enum", 0, 12),
      ``,
      `export const WorkflowStatus = Schema.Enum(["accepted", "running", "paused", "suspended", "sleeping", "completed", "failed"]);`,
      ``,
      `export const WorkflowJournalEntry = Schema.Struct({`,
      `  runId: Schema.String,`,
      `  stepId: Schema.String,`,
      `  startedAt: Schema.String,`,
      `  payload: Schema.Unknown,`,
      `});`,
      ``,
      `export const WorkflowRunView = Schema.Struct({`,
      `  id: Schema.String,`,
      `  title: Schema.String,`,
      `  status: WorkflowStatus,`,
      `  steps: Schema.Array(WorkflowStepView),`,
      `  journal: Schema.Array(WorkflowJournalEntry),`,
      `});`,
      ``,
      ...filler("view", 0, 10),
      ``,
      `export type WorkflowRunViewType = Schema.Schema.Type<typeof WorkflowRunView>;`,
    ],
  },
  {
    path: "test/qualification.workflow.test.ts",
    oldLines: [
      `import { describe, it, expect } from "vitest";`,
      `import { qualificationWorkflow } from "apps/server/src/workflow/qualification.workflow";`,
      `import { runWorkflow } from "./helpers";`,
      ``,
      ...filler("setup", 0, 10),
      ``,
      `describe("qualification workflow", () => {`,
      `  it("appends a journal entry per step", async () => {`,
      `    const result = await runWorkflow(qualificationWorkflow(input));`,
      `    expect(result.journal.length).toBe(3);`,
      `  });`,
      ``,
      `  it("fails when a stream rejects", async () => {`,
      `    await expect(`,
      `      runWorkflow(qualificationWorkflow(failingInput)),`,
      `    ).rejects.toThrow("stream rejected");`,
      `  });`,
      `});`,
      ``,
      ...filler("more", 0, 8),
    ],
    newLines: [
      `import { describe, it, expect } from "vitest";`,
      `import { qualificationWorkflow } from "apps/server/src/workflow/qualification.workflow";`,
      `import { runWorkflow, runUntil, resumeWorkflow } from "./helpers";`,
      ``,
      ...filler("setup", 0, 10),
      ``,
      `describe("qualification workflow", () => {`,
      `  it("appends a journal entry per step", async () => {`,
      `    const result = await runWorkflow(qualificationWorkflow(input), { database });`,
      `    const entries = await database.query("select * from workflow_journal order by step_id");`,
      `    expect(entries.rows.map((row) => row.step_id)).toEqual([`,
      `      "fetch-manifest",`,
      `      "plan",`,
      `      "review-0",`,
      `    ]);`,
      `    expect(entries.rows[0].payload.manifest).toMatchObject({ ticketId: input.ticketId });`,
      `  });`,
      ``,
      `  it("resumes from the last durable step", async () => {`,
      `    const aborted = await runUntil("plan", qualificationWorkflow(input));`,
      `    const resumed = await resumeWorkflow(aborted.runId, { database });`,
      `    expect(resumed.journal[2].stepId).toBe("review-0");`,
      `  });`,
      ``,
      `  it("fails when a stream rejects", async () => {`,
      `    await expect(`,
      `      runWorkflow(qualificationWorkflow(failingInput)),`,
      `    ).rejects.toThrow("stream rejected");`,
      `  });`,
      `});`,
      ``,
      ...filler("more", 0, 8),
    ],
  },
];

type DiffOp = { kind: "ctx" | "del" | "add"; line: string };

/** Longest-common-subsequence diff, good enough for small sample files. */
function diffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const n = oldLines.length;
  const m = newLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const cell = (i: number, j: number): number => dp[i]?.[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const same = oldLines[i] === newLines[j];
      const row = dp[i];
      if (row === undefined) continue;
      row[j] = same ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
    }
  }
  const ops: DiffOp[] = [];
  for (let i = 0, j = 0; i < n || j < m;) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];
    if (i < n && j < m && oldLine === newLine) {
      if (oldLine === undefined || newLine === undefined) break;
      ops.push({ kind: "ctx", line: oldLine });
      i++;
      j++;
    } else if (j < m && (i === n || cell(i + 1, j) >= cell(i, j + 1))) {
      if (newLine === undefined) break;
      ops.push({ kind: "add", line: newLine });
      j++;
    } else {
      if (oldLine === undefined) break;
      ops.push({ kind: "del", line: oldLine });
      i++;
    }
  }
  return ops;
}

const CONTEXT = 3;

/** Unified hunks (3 lines of context) from the full-file ops. */
function opsToHunks(ops: DiffOp[]): string[] {
  const changed = ops
    .map((op, index) => (op.kind !== "ctx" ? index : -1))
    .filter((index) => index >= 0);
  const regions: Array<[number, number]> = [];
  for (const index of changed) {
    const last = regions.at(-1);
    if (last !== undefined && index - last[1] - 1 < CONTEXT * 2) last[1] = index;
    else regions.push([index, index]);
  }
  const hunks: string[] = [];
  for (const [start, end] of regions) {
    const from = Math.max(0, start - CONTEXT);
    const to = Math.min(ops.length - 1, end + CONTEXT);
    let oldStart = 1;
    let newStart = 1;
    for (let k = 0; k < from; k++) {
      const op = ops[k];
      if (op === undefined) break;
      if (op.kind === "ctx") {
        oldStart++;
        newStart++;
      } else if (op.kind === "del") oldStart++;
      else newStart++;
    }
    let oldCount = 0;
    let newCount = 0;
    const body: string[] = [];
    for (let k = from; k <= to; k++) {
      const op = ops[k];
      if (op === undefined) break;
      if (op.kind === "ctx") {
        body.push(` ${op.line}`);
        oldCount++;
        newCount++;
      } else if (op.kind === "del") {
        body.push(`-${op.line}`);
        oldCount++;
      } else {
        body.push(`+${op.line}`);
        newCount++;
      }
    }
    hunks.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body.join("\n")}`);
  }
  return hunks;
}

export function generateSamplePatch(files: SampleFile[] = SAMPLE_FILES): string {
  const parts = files.map((file) =>
    [
      `diff --git a/${file.path} b/${file.path}`,
      `--- a/${file.path}`,
      `+++ b/${file.path}`,
      ...opsToHunks(diffOps(file.oldLines, file.newLines)),
    ].join("\n"),
  );
  return parts.join("\n\n") + "\n";
}

/** The host's full-file answer, for the story's `loadDiffFiles`. */
export function sampleFileContents(path: string): { oldContents: string; newContents: string } {
  const file = SAMPLE_FILES.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`No sample file at ${path}`);
  return {
    oldContents: file.oldLines.join("\n") + "\n",
    newContents: file.newLines.join("\n") + "\n",
  };
}
