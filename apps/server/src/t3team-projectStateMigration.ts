// @effect-diagnostics nodeBuiltinImport:off -- directory junctions/symlinks and lstat are not in effect/FileSystem.
// @effect-diagnostics preferSchemaOverJson:off -- the journal is a small local JSON file validated by `version`.
/**
 * Instant main-repository switches (flag `NEXI_FF_MAIN_REPOSITORY`): the project state dir is made
 * available in the new checkout at once through directory links, and the real files follow in a
 * durable background job (`t3team-projectStateMigrationRun.ts`).
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
import * as HostProcess from "@t3tools/shared/HostProcess";
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

export const STATE_MIGRATION_JOURNAL_FILE = "main-repository-migration.json";
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

export type DirectoryLinkPlan =
  | { readonly kind: "junction" | "dir"; readonly target: string; readonly linkPath: string }
  | { readonly kind: "unsupported"; readonly reason: string };

/** How to link `linkPath` to the directory `target` on `platform`. Windows junctions need an
 * absolute local target (a junction cannot point at a network share); paths are normalized to
 * backslashes. Pure, so the Windows rules are unit-testable anywhere. */
export const planDirectoryLink = (input: {
  readonly platform: NodeJS.Platform;
  readonly target: string;
  readonly linkPath: string;
}): DirectoryLinkPlan => {
  if (input.platform !== "win32") {
    const posix = NodePath.posix;
    if (!posix.isAbsolute(input.target)) return { kind: "unsupported", reason: "relative target" };
    return { kind: "dir", target: posix.normalize(input.target), linkPath: input.linkPath };
  }
  const win = NodePath.win32;
  const target = win.normalize(input.target.replaceAll("/", "\\"));
  const linkPath = win.normalize(input.linkPath.replaceAll("/", "\\"));
  if (target.startsWith("\\\\")) {
    return { kind: "unsupported", reason: "a junction cannot point at a network path" };
  }
  if (!/^[A-Za-z]:\\/.test(target)) return { kind: "unsupported", reason: "relative target" };
  if (linkPath.startsWith("\\\\")) {
    return { kind: "unsupported", reason: "a junction cannot live on a network path" };
  }
  return { kind: "junction", target, linkPath };
};

export const stateMigrationJournalPath = (toRoot: string) =>
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

const lstatOrUndefined = (target: string) =>
  io(() => NodeFSP.lstat(target)).pipe(Effect.orElseSucceed(() => undefined));
const statOrUndefined = (target: string) =>
  io(() => NodeFSP.stat(target)).pipe(Effect.orElseSucceed(() => undefined));
const realPathOrUndefined = (target: string) =>
  io(() => NodeFSP.realpath(target)).pipe(Effect.orElseSucceed(() => undefined));

const isWithin = (child: string, parent: string) =>
  child === parent ||
  child.startsWith(parent.endsWith(NodePath.sep) ? parent : parent + NodePath.sep);

/** Creates a directory link per `planDirectoryLink`; fails when the platform or volume cannot. */
export const createDirectoryLink = (input: {
  readonly target: string;
  readonly linkPath: string;
  readonly platform?: NodeJS.Platform;
}) =>
  Effect.gen(function* () {
    const plan = planDirectoryLink({
      platform: input.platform ?? (yield* HostProcess.Platform),
      target: input.target,
      linkPath: input.linkPath,
    });
    if (plan.kind === "unsupported") {
      return yield* Effect.fail(new StateMigrationIoError({ cause: plan.reason }));
    }
    yield* io(() => NodeFSP.symlink(plan.target, plan.linkPath, plan.kind));
  });

/** Upper bound on the filesystem probes the instant phase makes; anything past it is merged by
 * the background job, so a switch stays well under a second on any state size. */
export const LINK_PHASE_PROBE_BUDGET = 400;

/**
 * The instant phase of a switch: plans the migration of `fromRoot`'s state dir into `toRoot`,
 * links every directory the target lacks, and records the plan in the target's journal (merged
 * with a journal already there, e.g. a second switch into the same checkout). Never copies a file.
 * Returns the journal for the background job.
 */
export const planAndLinkStateMigration = Effect.fn("planAndLinkStateMigration")(function* (input: {
  readonly fromRoot: string;
  readonly toRoot: string;
  readonly probeBudget?: number;
  readonly createLink?: typeof createDirectoryLink;
}) {
  const createLink = input.createLink ?? createDirectoryLink;
  const sourceRoot = NodePath.join(input.fromRoot, HIDDEN_T3TEAM_DIR);
  const targetRoot = NodePath.join(input.toRoot, HIDDEN_T3TEAM_DIR);
  const now = DateTime.formatIso(yield* DateTime.now);
  const existing = yield* readStateMigrationJournal(input.toRoot);
  const journal: StateMigrationJournal = existing ?? {
    version: 1,
    toRoot: input.toRoot,
    fromRoots: [],
    status: "running",
    entries: [],
    copiedFiles: 0,
    startedAt: now,
    updatedAt: now,
  };
  const realSourceRoot = yield* realPathOrUndefined(sourceRoot);
  yield* io(() => NodeFSP.mkdir(targetRoot, { recursive: true }));
  const realTargetRoot = (yield* realPathOrUndefined(targetRoot)) ?? targetRoot;
  if (!realSourceRoot || realSourceRoot === realTargetRoot) return journal;
  if (!journal.fromRoots.includes(input.fromRoot)) journal.fromRoots.push(input.fromRoot);

  const pendingPaths = new Set(
    journal.entries.filter((entry) => entry.status === "pending").map((e) => e.relativePath),
  );
  const add = (entry: Omit<StateMigrationEntry, "status">) => {
    if (pendingPaths.has(entry.relativePath)) return;
    pendingPaths.add(entry.relativePath);
    journal.entries.push({ ...entry, status: "pending" });
  };
  let probes = 0;
  const budget = input.probeBudget ?? LINK_PHASE_PROBE_BUDGET;

  const visit = (segments: ReadonlyArray<string>): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (isStateMigrationExcluded(segments)) return;
      const relativePath = segments.join("/");
      const source = NodePath.join(sourceRoot, ...segments);
      const target = NodePath.join(targetRoot, ...segments);
      probes += 1;
      if (probes > budget) {
        const real = yield* realPathOrUndefined(source);
        if (real && !isWithin(real, realTargetRoot))
          add({ relativePath, mode: "merge", source: real });
        return;
      }
      const sourceInfo = yield* statOrUndefined(source);
      const real = sourceInfo ? yield* realPathOrUndefined(source) : undefined;
      // Missing, or already the target's own content (a switch back through a link).
      if (!sourceInfo || !real || isWithin(real, realTargetRoot)) return;
      const targetInfo = yield* lstatOrUndefined(target);
      if (sourceInfo.isDirectory()) {
        if (!targetInfo) {
          const linked = yield* createLink({ target: real, linkPath: target }).pipe(
            Effect.as(true),
            Effect.orElseSucceed(() => false),
          );
          add({ relativePath, mode: linked ? "linked" : "merge", source: real });
          return;
        }
        if (targetInfo.isSymbolicLink() || !targetInfo.isDirectory()) return; // target wins
        const children = yield* io(() => NodeFSP.readdir(source)).pipe(
          Effect.orElseSucceed((): string[] => []),
        );
        for (const child of children) yield* visit([...segments, child]);
        return;
      }
      if (sourceInfo.isFile() && !targetInfo) add({ relativePath, mode: "copy", source: real });
    }).pipe(Effect.orElseSucceed(() => undefined));

  const topLevel = yield* io(() => NodeFSP.readdir(sourceRoot)).pipe(
    Effect.orElseSucceed((): string[] => []),
  );
  for (const child of topLevel) yield* visit([child]);
  journal.status = journal.entries.some((entry) => entry.status === "pending") ? "running" : "done";
  yield* writeStateMigrationJournal(journal);
  return journal;
});
