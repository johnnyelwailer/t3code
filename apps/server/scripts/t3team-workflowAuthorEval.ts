#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - a manual CLI that prints its report.
/**
 * Live eval of orchestration authoring and launching against a real model (manual, not CI).
 *
 *   node apps/server/scripts/t3team-workflowAuthorEval.ts --model high --role author --out <dir>
 *   node apps/server/scripts/t3team-workflowAuthorEval.ts --runner claude --model sonnet --out <dir>
 *
 * `author` sends the real kickoff turn and lets the model validate and submit through the real
 * checks; `caller` sends a user request to a launching agent holding the real orchestration tools.
 * Results land in `<dir>/<label>-<role>-<model>.json` plus a printed markdown summary.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { buildWorkflowAuthorKickoff } from "../src/t3team-workflowAuthorPrompt.ts";
import { WORKFLOW_AUTHOR_EVAL_CASES } from "./t3team-workflowAuthorEvalCases.ts";
import { runClaudeTurn } from "./t3team-workflowAuthorEvalClaude.ts";
import { runEvalTurn, type TurnMetrics } from "./t3team-workflowAuthorEvalGateway.ts";
import { AUTHOR_TOOLS, CALLER_TOOLS, EVAL_PROVIDERS } from "./t3team-workflowAuthorEvalTools.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    model: { type: "string", default: "high" },
    role: { type: "string", default: "author" },
    cases: { type: "string" },
    repeat: { type: "string", default: "1" },
    concurrency: { type: "string", default: "3" },
    out: { type: "string", default: "workflow-author-eval" },
    label: { type: "string", default: "run" },
    system: { type: "string" },
    runner: { type: "string", default: "gateway" },
    "base-url": {
      type: "string",
      default: process.env.GATEWAY_BASE_URL ?? "https://chat.nexplore.dev/v1",
    },
  },
});
const role = values.role === "caller" ? "caller" : "author";
const system =
  values.system === undefined
    ? "You are a coding agent in T3 Code. Use the provided tools when they fit the request."
    : NodeFS.readFileSync(values.system, "utf8");
const selected = WORKFLOW_AUTHOR_EVAL_CASES.filter(
  (item) => values.cases === undefined || values.cases.split(",").includes(item.id),
);
const jobs = selected.flatMap((item) =>
  Array.from({ length: Number(values.repeat) }, (_, attempt) => ({ item, attempt })),
);

/** GHE #405: while the run is only being authored, a reply may be empty or say exactly that; any
 * other reply ("started", "underway", "watching now") reads to the user as a running run. */
const claimsRunning = (text: string) =>
  text.trim().length > 0 &&
  !/prepar|author|being (written|set up)|not (yet )?(running|started)|vorbereit/i.test(text);

interface Row extends TurnMetrics {
  readonly caseId: string;
  readonly attempt: number;
  readonly falseRunningClaim: boolean;
}

async function runJob(job: (typeof jobs)[number]): Promise<Row> {
  const prompt =
    role === "author"
      ? buildWorkflowAuthorKickoff({
          intent: job.item.intent,
          args: job.item.args,
          providers: EVAL_PROVIDERS,
        })
      : job.item.request;
  const metrics =
    values.runner === "claude"
      ? await runClaudeTurn({ model: values.model, role, system, prompt })
      : await runEvalTurn({
          baseUrl: values["base-url"].replace(/\/+$/, ""),
          model: values.model,
          role,
          system,
          prompt,
          toolNames: role === "author" ? AUTHOR_TOOLS : CALLER_TOOLS,
        });
  const row = {
    ...metrics,
    caseId: job.item.id,
    attempt: job.attempt,
    falseRunningClaim: role === "caller" && metrics.launched && claimsRunning(metrics.finalText),
  };
  console.error(
    `${row.caseId}#${row.attempt}: launched=${row.launched} firstOk=${row.firstSubmitAccepted} calls=${row.toolCalls} rej=${JSON.stringify(row.rejections)} reasoning=${row.reasoningChars}${row.error ? ` error=${row.error}` : ""}`,
  );
  return row;
}

async function runAll(): Promise<Row[]> {
  const rows: Row[] = [];
  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift())
      rows.push(await runJob(job));
  };
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
  return rows.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.attempt - b.attempt);
}

const mean = (rows: ReadonlyArray<Row>, pick: (row: Row) => number) =>
  rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + pick(row), 0) / rows.length);
const pct = (rows: ReadonlyArray<Row>, pick: (row: Row) => boolean) =>
  `${rows.filter(pick).length}/${rows.length}`;

function summarize(rows: ReadonlyArray<Row>): string {
  const launched = rows.filter((row) => row.msToLaunch !== null);
  return [
    `### ${values.label} — role=${role} model=${values.model}`,
    "| metric | value |",
    "| --- | --- |",
    `| launched | ${pct(rows, (row) => row.launched)} |`,
    `| first submit accepted | ${pct(rows, (row) => row.firstSubmitAccepted === true)} |`,
    `| interface rejections (schema+tool) | ${rows.reduce((n, row) => n + row.rejections.schema + row.rejections.tool, 0)} |`,
    `| source-check rejections | ${rows.reduce((n, row) => n + row.rejections.check, 0)} |`,
    `| false "running" claims | ${pct(rows, (row) => row.falseRunningClaim)} |`,
    `| prompt chars (turn 1, incl. tools) | ${mean(rows, (row) => row.promptChars)} |`,
    `| prompt tokens (turn 1) | ${mean(rows, (row) => row.promptTokens)} |`,
    `| reasoning chars / turn | ${mean(rows, (row) => row.reasoningChars)} |`,
    `| completion tokens / turn | ${mean(rows, (row) => row.completionTokens)} |`,
    `| tool calls / turn | ${mean(rows, (row) => row.toolCalls)} |`,
    `| s to launch (launched only) | ${Math.round(mean(launched, (row) => row.msToLaunch ?? 0) / 1000)} |`,
    `| hit max_tokens | ${pct(rows, (row) => row.finishReasons.includes("length"))} |`,
    `| errors | ${pct(rows, (row) => row.error !== undefined)} |`,
  ].join("\n");
}

const rows = await runAll();
NodeFS.mkdirSync(values.out, { recursive: true });
const file = NodePath.join(values.out, `${values.label}-${role}-${values.model}.json`);
NodeFS.writeFileSync(file, JSON.stringify(rows, null, 2));
console.log(summarize(rows));
console.log(`\nrows: ${file}`);
