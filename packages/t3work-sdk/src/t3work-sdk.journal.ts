/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * Journal path helpers + run-metadata persistence for the durable-execution engine.
 *
 * The on-disk shape is `.t3work-runs/<run-id>/journal.jsonl` (one JSONL line per journaled
 * primitive call) plus a sibling `runMeta.json` that records the workflow's inputs hash
 * at start, so a resume that supplies different args is caught at the input boundary
 * (drift at `seq 0`) before the body re-runs. The reader and writer that touch the
 * JSONL file live in separate files so this one stays focused on paths and run metadata.
 *
 * Spec doc 25 §Open question 2 leaves the long-term home open (SQL-backed local cache);
 * `.t3work-runs/<run-id>/journal.jsonl` is the MVP on-disk shape the spec documents.
 */

import * as NodeModule from "node:module";

import * as Schema from "effect/Schema";

// `fs`/`path` via NodeModule.createRequire — see the note in t3work-sdk.journalWriter.ts.
const nodeRequire = NodeModule.createRequire(import.meta.url);

interface NodeFsModule {
  readonly writeFileSync: (path: string, data: string) => void;
  readonly existsSync: (path: string) => boolean;
  readonly mkdirSync: (path: string, options: { readonly recursive: boolean }) => void;
  readonly appendFileSync: (path: string, data: string) => void;
  readonly readFileSync: (path: string, encoding: "utf8") => string;
}
interface NodePathModule {
  readonly join: (...parts: ReadonlyArray<string>) => string;
}
const fs = nodeRequire("node:fs") as NodeFsModule;
const path = nodeRequire("node:path") as NodePathModule;

/** Per-run inputs, recorded once at start so a resume can detect input-args divergence. */
export const RunMetaSchema = Schema.Struct({
  workflowPath: Schema.String,
  argsHash: Schema.String,
  createdAt: Schema.String,
});
export type RunMeta = typeof RunMetaSchema.Type;
const decodeRunMeta = Schema.decodeUnknownSync(RunMetaSchema);

export function runDirPath(runsRoot: string, runId: string): string {
  return path.join(runsRoot, runId);
}
export function journalFilePath(runsRoot: string, runId: string): string {
  return path.join(runDirPath(runsRoot, runId), "journal.jsonl");
}
export function runMetaFilePath(runsRoot: string, runId: string): string {
  return path.join(runDirPath(runsRoot, runId), "runMeta.json");
}

/** True if a journal file exists for this run (even if empty) — the resume precondition. */
export function journalExists(journalPath: string): boolean {
  return fs.existsSync(journalPath);
}

/**
 * Create `.t3work-runs/<run-id>/` and an empty `journal.jsonl` if they do not exist.
 * Idempotent: an existing journal is left untouched so a from-scratch start never clobbers
 * a run (the engine separately refuses to *start* over a non-empty journal).
 */
export function ensureRunDir(runsRoot: string, runId: string): string {
  const dir = runDirPath(runsRoot, runId);
  fs.mkdirSync(dir, { recursive: true });
  const file = journalFilePath(runsRoot, runId);
  if (!fs.existsSync(file)) {
    fs.appendFileSync(file, "");
  }
  return file;
}

/** Empty the journal + drop the run metadata — used by `startWorkflow({ overwrite: true })`. */
export function truncateRun(runsRoot: string, runId: string): void {
  fs.writeFileSync(journalFilePath(runsRoot, runId), "");
  const metaPath = runMetaFilePath(runsRoot, runId);
  if (fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, "");
  }
}

export function writeRunMeta(metaPath: string, meta: RunMeta): void {
  fs.writeFileSync(metaPath, JSON.stringify(meta));
}

/** Read recorded run inputs, or `undefined` if none was written (pre-this-version runs). */
export function readRunMeta(metaPath: string): RunMeta | undefined {
  if (!fs.existsSync(metaPath)) return undefined;
  const text = fs.readFileSync(metaPath, "utf8").trim();
  if (text.length === 0) return undefined;
  return decodeRunMeta(JSON.parse(text));
}
