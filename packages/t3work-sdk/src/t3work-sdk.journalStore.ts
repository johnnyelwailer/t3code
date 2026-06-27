/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
/**
 * The JournalStore seam (Epic 25 §Open question 2 — journal storage).
 *
 * The engine no longer talks to the filesystem directly: it reads and appends through a
 * {@link JournalStore}, so the per-run journal + run-metadata can live on local disk
 * ({@link FsJournalStore}, the default) OR in the host's database (the server provides a
 * SQLite-backed store) without the replay engine knowing the difference. All 25.2/25.4
 * journal semantics — the void/value envelope, schema re-validation on replay, drift
 * detection, `script-never` markers, the `sent`/`resolved` Handle split — are preserved
 * because the store only moves the *same* wire objects to a different medium.
 *
 * ── The sync-append / async-store bridge ─────────────────────────────────────
 * The store methods are async (a DB write is). But the body's synchronous primitives —
 * `Date.now()` / `Math.random()` / `crypto.randomUUID()` and the one-way Handle sends
 * (`thread.create` / `thread.message`) — journal from a synchronous call site that cannot
 * await. {@link createStoreSink} bridges the two: `append`/`appendResolved` enqueue
 * synchronously onto an ordered tail promise, and {@link JournalSink.flush} is the durability
 * barrier the engine awaits before it returns a completed/suspended outcome. The fs backend's
 * append is itself fsync-durable, so for the default path "flush" only re-surfaces a deferred
 * write error; the DB backend's rows become durable as the tail drains, with `flush` the
 * commit barrier at the suspend boundary.
 */

import * as NodeModule from "node:module";

import type { RunMeta } from "./t3work-sdk.journal.ts";
import {
  ensureRunDir,
  journalExists,
  journalFilePath,
  readRunMeta as readRunMetaFs,
  runMetaFilePath,
  truncateRun,
  writeRunMeta as writeRunMetaFs,
} from "./t3work-sdk.journal.ts";
import type { JournalEntry, JournalMaps } from "./t3work-sdk.journalReader.ts";
import { readJournalEntries } from "./t3work-sdk.journalReader.ts";
import {
  appendWireLine,
  type ResolvedWireInput,
  toResolvedWire,
  toWire,
} from "./t3work-sdk.journalWriter.ts";

const nodeRequire = NodeModule.createRequire(import.meta.url);
const path = nodeRequire("node:path") as {
  readonly join: (...parts: ReadonlyArray<string>) => string;
};
const proc = nodeRequire("node:process") as { readonly cwd: () => string };

/**
 * Pluggable durable storage for a run's journal + metadata. One instance backs any number of
 * runs (keyed by `runId`). Implementations: {@link FsJournalStore} (default, on local disk)
 * and the host's SQLite store.
 */
export interface JournalStore {
  /** Durably append a call/sent entry (was `JournalWriter.append`, with fsync). */
  appendEntry(runId: string, entry: JournalEntry): Promise<void>;
  /** Durably append an out-of-band `resolved` reply, keyed by `correlationId`. */
  appendResolved(runId: string, resolved: ResolvedWireInput): Promise<void>;
  /** Load the replay maps (`seq → entry`, `correlationId → resolved`). Empty if no run. */
  readEntries(runId: string): Promise<JournalMaps>;
  /** Recorded run inputs, or `undefined` if none was written (drift boundary at seq 0). */
  readRunMeta(runId: string): Promise<RunMeta | undefined>;
  /** Record run inputs once at start, so a resume can detect input-args divergence. */
  writeRunMeta(runId: string, meta: RunMeta): Promise<void>;
  /** True if a journal exists for this run (the resume precondition / start guard). */
  hasRun(runId: string): Promise<boolean>;
  /** Drop a run's journal + metadata — backs `startWorkflow({ overwrite: true })`. */
  clear(runId: string): Promise<void>;
  /** A human-readable locator for this run's journal (a file path for fs, a table ref for a
   * DB), used in not-found / drift error messages. */
  locator(runId: string): string;
}

/**
 * The in-run append surface the durable runtime + Handle dispatch write through. Append is
 * synchronous (the deterministic primitives + one-way sends require it); durability is the
 * store's async job, which {@link flush} awaits at the run's completion/suspension boundary.
 */
export interface JournalSink {
  append(entry: JournalEntry): void;
  appendResolved(input: ResolvedWireInput): void;
  /** Await every enqueued append; re-throws the first deferred store error. */
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Adapt a {@link JournalStore} to the synchronous {@link JournalSink} the engine writes to.
 * Appends are sequenced on a single tail promise so on-disk/row order matches call order; a
 * store error is captured and re-thrown at {@link JournalSink.flush}, which the engine awaits
 * before returning a result (so a run never reports "suspended"/"completed" over a failed
 * journal write).
 */
export function createStoreSink(store: JournalStore, runId: string): JournalSink {
  let tail: Promise<void> = Promise.resolve();
  let failure: unknown;
  const chain = (op: () => Promise<void>): void => {
    tail = tail
      .then(() => (failure === undefined ? op() : undefined))
      .catch((error) => {
        if (failure === undefined) failure = error;
      });
  };
  return {
    append: (entry) => chain(() => store.appendEntry(runId, entry)),
    appendResolved: (input) => chain(() => store.appendResolved(runId, input)),
    flush: async () => {
      await tail;
      if (failure !== undefined) {
        const error = failure;
        failure = undefined;
        throw error;
      }
    },
    dispose: () => {},
  };
}

/** Default runs root: `.t3work-runs/` under the cwd (the on-disk MVP shape doc 25 documents). */
export function defaultRunsRoot(): string {
  return path.join(proc.cwd(), ".t3work-runs");
}

/**
 * The default {@link JournalStore}: the filesystem layout the SDK has always used —
 * `.t3work-runs/<run-id>/journal.jsonl` + a sibling `runMeta.json`. Keeps the SDK's own
 * tests + standalone use unchanged. Each append is its own fsync-durable line, so torn-tail
 * recovery (in {@link readJournalEntries}) still applies on this backend.
 */
export class FsJournalStore implements JournalStore {
  private readonly runsRoot: string;
  private readonly onWarn: (message: string) => void;

  constructor(runsRoot: string, onWarn: (message: string) => void = () => {}) {
    this.runsRoot = runsRoot;
    this.onWarn = onWarn;
  }

  async appendEntry(runId: string, entry: JournalEntry): Promise<void> {
    ensureRunDir(this.runsRoot, runId);
    appendWireLine(journalFilePath(this.runsRoot, runId), toWire(entry));
  }

  async appendResolved(runId: string, resolved: ResolvedWireInput): Promise<void> {
    ensureRunDir(this.runsRoot, runId);
    appendWireLine(journalFilePath(this.runsRoot, runId), toResolvedWire(resolved));
  }

  async readEntries(runId: string): Promise<JournalMaps> {
    return readJournalEntries(journalFilePath(this.runsRoot, runId), this.onWarn);
  }

  async readRunMeta(runId: string): Promise<RunMeta | undefined> {
    return readRunMetaFs(runMetaFilePath(this.runsRoot, runId));
  }

  async writeRunMeta(runId: string, meta: RunMeta): Promise<void> {
    ensureRunDir(this.runsRoot, runId);
    writeRunMetaFs(runMetaFilePath(this.runsRoot, runId), meta);
  }

  async hasRun(runId: string): Promise<boolean> {
    return journalExists(journalFilePath(this.runsRoot, runId));
  }

  async clear(runId: string): Promise<void> {
    if (journalExists(journalFilePath(this.runsRoot, runId))) truncateRun(this.runsRoot, runId);
  }

  locator(runId: string): string {
    return journalFilePath(this.runsRoot, runId);
  }
}
