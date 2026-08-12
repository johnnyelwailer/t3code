#!/usr/bin/env tsx
/**
 * CLI entry point: `tsx src/run-job.ts <jobspec.json>`.
 *
 * Streams NDJSON JobEvents to stdout as the job progresses, then writes
 * the final JobResult as the last line (also NDJSON — one JSON object per
 * line, so a consumer can `readline` this process's stdout uniformly).
 *
 * This is the shape a Temporal Activity will invoke in stage 3 (see
 * docs/design/resident-agent.md, "Execution plane"): the activity spawns
 * this process (or calls runJob()/executor.ts directly in-process — either
 * works since the contract is the same), forwards each JobEvent into the
 * journal, and returns the JobResult as the activity's result. Nothing
 * about this CLI is Temporal-specific; it exists so the executor is
 * runnable and testable standalone before stage 3 wires it in.
 */
import { readFile } from "node:fs/promises";
import { parseJobSpec } from "./contract.js";
import { runJob } from "./executor.js";

async function main(): Promise<void> {
  const specPath = process.argv[2];
  if (!specPath) {
    process.stderr.write("usage: run-job.ts <jobspec.json>\n");
    process.exit(2);
  }

  const raw = JSON.parse(await readFile(specPath, "utf8"));
  const spec = parseJobSpec(raw);

  const result = await runJob(spec, {
    onEvent: (event) => {
      process.stdout.write(JSON.stringify(event) + "\n");
    },
  });

  process.stdout.write(JSON.stringify(result) + "\n");
  process.exit(result.timedOut ? 1 : (result.exitCode ?? 0));
}

main().catch((err) => {
  process.stderr.write(`run-job failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
