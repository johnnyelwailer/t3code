// @effect-diagnostics nodeBuiltinImport:off -- atomic journal writes use node:fs/promises rename.
// @effect-diagnostics preferSchemaOverJson:off -- the journal is a small local JSON file validated by `version`.
/**
 * Instant main-repository switches (flag `NEXI_FF_MAIN_REPOSITORY`): the project state dir is made
 * available in the new checkout at once through directory links, and the real files follow in a
 * durable background job (`t3team-projectStateMigrationRun.ts`). This module holds the journal;
 * the instant link phase is `t3team-projectStateMigrationLink.ts`.
 *
 * Link-first, because every state reader resolves `<workspaceRoot>/<state dir>/…` directly: a link
 * makes the old content readable and writable at the new path with zero copying, and a path-based
 * link keeps working after the job swaps a real folder in. On Windows the link is a directory
 * junction (no admin or developer mode needed, unlike symlinks; local volumes only), elsewhere a
 * directory symlink. Where no link can be made, the entry is copied by the job instead (missing
 * at the new path until then).
 *
 * The journal lives in `<target>/<state dir>/references/` (ignored in main checkouts, never
 * migrated), so the plan survives a crash or restart and is resumed from the project record.
 *
 * @module t3team-projectStateMigration
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as Clock from "effect/Clock";
import * as Data from "effect/Data";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS } from "./t3team-context-blob-store-utils.ts";
import {
  CHILD_WORKTREES_DIR_NAME,
  HIDDEN_T3TEAM_DIR,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";

/** Any filesystem failure of a state migration step. */
export class StateMigrationIoError extends Data.TaggedError("StateMigrationIoError")<{
  readonly cause: unknown;
}> {}

/** A Node filesystem promise as an Effect with a tagged failure. */
export const io = <A>(run: () => Promise<A>): Effect.Effect<A, StateMigrationIoError> =>
  Effect.tryPromise({ try: run, catch: (cause) => new StateMigrationIoError({ cause }) });

const STATE_MIGRATION_JOURNAL_FILE = "main-repository-migration.json";
/** Suffixes of the job's working names next to an entry (see the swap in the run module). */
export const MIGRATING_SUFFIX = ".nexi-migrating";
export const LINK_OLD_SUFFIX = ".nexi-link-old";
export const PART_SUFFIX = ".nexi-part";

/** `linked`: a directory link now, a real copy later. `copy`: one file, copied later.
 * `merge`: a directory that exists on both sides (or past the link budget): files missing in the
 * target are copied later; target files win. */
export type StateMigrationEntryMode = "linked" | "copy" | "merge";
export type StateMigrationEntryStatus = "pending" | "done" | "lost" | "failed";

export type StateMigrationEntry = {
  readonly relativePath: string;
  readonly mode: StateMigrationEntryMode;
  /** The real (link-resolved) source path at planning time. */
  readonly source: string;
  /** `copy` only: the target already has this file, but an older, untracked one (a leftover of an
   * earlier switch attempt): the source replaces it unless the target has changed since. Builds
   * that predate the field skip the entry, as before. */
  readonly replaceOlder?: true;
  status: StateMigrationEntryStatus;
  error?: string;
};

export type StateMigrationJournal = {
  readonly version: 1;
  readonly toRoot: string;
  fromRoots: string[];
  status: "running" | "done";
  entries: StateMigrationEntry[];
  copiedFiles: number;
  readonly startedAt: string;
  updatedAt: string;
};

export type StateMigrationSummary = {
  readonly status: "running" | "done";
  readonly pending: number;
  readonly lost: number;
  readonly failed: number;
  readonly copiedFiles: number;
};

export const summarizeStateMigration = (journal: StateMigrationJournal): StateMigrationSummary => ({
  status: journal.status,
  pending: journal.entries.filter((entry) => entry.status === "pending").length,
  lost: journal.entries.filter((entry) => entry.status === "lost").length,
  failed: journal.entries.filter((entry) => entry.status === "failed").length,
  copiedFiles: journal.copiedFiles,
});

/** State-dir-relative paths a migration never touches: reference clones and the manifest (the
 * switch writes the target's own), child worktrees (copying a git worktree orphans it), the
 * job's own working names, and the re-creatable context blob cache. */
export const isStateMigrationExcluded = (segments: ReadonlyArray<string>): boolean => {
  const [top, second] = segments;
  if (top === undefined) return false;
  if (top === REFERENCES_DIR_NAME || top === CHILD_WORKTREES_DIR_NAME) return true;
  const last = segments[segments.length - 1] ?? "";
  if (last.endsWith(MIGRATING_SUFFIX) || last.endsWith(LINK_OLD_SUFFIX)) return true;
  if (last.endsWith(PART_SUFFIX)) return true;
  return (
    top === T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS[0] && second === T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS[1]
  );
};

const stateMigrationJournalPath = (toRoot: string) =>
  NodePath.join(toRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, STATE_MIGRATION_JOURNAL_FILE);

export const readStateMigrationJournal = (toRoot: string) =>
  io(() => NodeFSP.readFile(stateMigrationJournalPath(toRoot), "utf8")).pipe(
    Effect.map((text) => JSON.parse(text) as StateMigrationJournal),
    Effect.map((journal) => (journal.version === 1 ? journal : undefined)),
    Effect.orElseSucceed(() => undefined),
  );

/** Atomic: write a temp file, then rename over the journal. */
export const writeStateMigrationJournal = (journal: StateMigrationJournal) =>
  Effect.gen(function* () {
    journal.updatedAt = DateTime.formatIso(yield* DateTime.now);
    const file = stateMigrationJournalPath(journal.toRoot);
    const temp = `${file}.${process.pid}.${yield* Clock.currentTimeMillis}.tmp`;
    yield* io(async () => {
      await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
      await NodeFSP.writeFile(temp, `${JSON.stringify(journal, null, 2)}\n`);
      await NodeFSP.rename(temp, file);
    });
  });
