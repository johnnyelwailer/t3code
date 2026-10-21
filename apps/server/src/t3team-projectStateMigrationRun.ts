// @effect-diagnostics nodeBuiltinImport:off -- the copy follows links and swaps junctions (lstat, rename, unlink).
/**
 * The background half of an instant main-repository switch: copies the real files behind each
 * journal entry into the new checkout, then swaps the link for the real folder. Durable and
 * resumable: every step is idempotent and recorded in the journal, so a crash or restart at any
 * point continues where it stopped.
 *
 * Per linked entry `<e>`:
 * 1. copy the source tree into `<e>.nexi-migrating` (files land as `*.nexi-part`, then rename;
 *    a file already there with the source's size is kept);
 * 2. swap: rename the link `<e>` → `<e>.nexi-link-old`, rename `<e>.nexi-migrating` → `<e>`,
 *    unlink `<e>.nexi-link-old` (never recursive, so the source is untouched);
 * 3. catch up: files written through the link while the copy ran are copied once more.
 * Any half-done swap is recognised from what is on disk and finished.
 *
 * The source going away (old location deleted) marks the entry `lost`: a dangling link is
 * removed so readers see a missing folder instead of an error, and a partial copy is kept.
 *
 * @module t3team-projectStateMigrationRun
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import {
  io,
  isStateMigrationExcluded,
  LINK_OLD_SUFFIX,
  MIGRATING_SUFFIX,
  PART_SUFFIX,
  readStateMigrationJournal,
  type StateMigrationEntry,
  type StateMigrationIoError,
  type StateMigrationJournal,
  writeStateMigrationJournal,
} from "./t3team-projectStateMigration.ts";

export type StateMigrationRunOptions = {
  /** Pause after every `throttleEvery` copied files, so the job never saturates the disk. */
  readonly throttleEvery?: number;
  readonly throttleMs?: number;
  /** Serializes journal writes and swaps with the instant phase of another switch. */
  readonly withJournalLock?: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  readonly onProgress?: (journal: StateMigrationJournal) => void;
  /** Test seam: throws after this many copied files, as a crash mid-copy would. */
  readonly crashAfterFiles?: number;
};

/** Test seam failure: stands in for the process dying mid-copy. */
export class StateMigrationCrash extends Data.TaggedError("StateMigrationCrash")<{}> {}

const lstat = (target: string) =>
  io(() => NodeFSP.lstat(target)).pipe(Effect.orElseSucceed(() => undefined));
const stat = (target: string) =>
  io(() => NodeFSP.stat(target)).pipe(Effect.orElseSucceed(() => undefined));

export const runStateMigration = Effect.fn("runStateMigration")(function* (
  toRoot: string,
  options: StateMigrationRunOptions = {},
) {
  const withLock = options.withJournalLock ?? (<A, E, R>(effect: Effect.Effect<A, E, R>) => effect);
  const throttleEvery = options.throttleEvery ?? 200;
  const throttleMs = options.throttleMs ?? 25;
  const targetRoot = NodePath.join(toRoot, HIDDEN_T3TEAM_DIR);
  let copiedThisRun = 0;
  let journal = yield* readStateMigrationJournal(toRoot);
  if (!journal) return undefined;

  /** Re-reads the journal under the lock and adopts entries a concurrent switch appended, so
   * neither side's writes are lost. */
  const adoptConcurrentEntries = (current: StateMigrationJournal) =>
    Effect.gen(function* () {
      const fresh = yield* readStateMigrationJournal(toRoot);
      if (!fresh) return;
      for (const added of fresh.entries) {
        if (!current.entries.some((entry) => entry.relativePath === added.relativePath)) {
          current.entries.push(added);
        }
      }
      for (const root of fresh.fromRoots) {
        if (!current.fromRoots.includes(root)) current.fromRoots.push(root);
      }
    });

  const persist = withLock(
    Effect.gen(function* () {
      if (!journal) return;
      yield* adoptConcurrentEntries(journal);
      if (journal.status === "done" && journal.entries.some((e) => e.status === "pending")) {
        journal.status = "running";
      }
      options.onProgress?.(journal);
      yield* writeStateMigrationJournal(journal);
    }),
  );

  const copyFile = (source: string, target: string, overwrite: boolean) =>
    Effect.gen(function* () {
      const sourceInfo = yield* stat(source);
      if (!sourceInfo?.isFile()) return;
      const targetInfo = yield* lstat(target);
      if (targetInfo && (!overwrite || targetInfo.size === sourceInfo.size)) return;
      if (options.crashAfterFiles !== undefined && copiedThisRun >= options.crashAfterFiles) {
        return yield* Effect.fail(new StateMigrationCrash());
      }
      yield* io(async () => {
        await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
        await NodeFSP.copyFile(source, `${target}${PART_SUFFIX}`);
        await NodeFSP.rename(`${target}${PART_SUFFIX}`, target);
      });
      copiedThisRun += 1;
      if (journal) journal.copiedFiles += 1;
      if (copiedThisRun % throttleEvery === 0) {
        yield* persist;
        if (throttleMs > 0) yield* Effect.sleep(throttleMs);
      }
    });

  /** Copies `source` (followed through links) into `target`. `overwrite`: replace files whose
   * size differs (the job's own folder); otherwise existing target files win. `newerOnly`: the
   * catch-up pass, copying only files changed after the target copy was made. */
  const copyTree = (
    source: string,
    target: string,
    segments: ReadonlyArray<string>,
    mode: { readonly overwrite: boolean; readonly newerOnly?: boolean },
  ): Effect.Effect<void, StateMigrationIoError | StateMigrationCrash> =>
    Effect.gen(function* () {
      const names = yield* io(() => NodeFSP.readdir(source));
      for (const name of names) {
        const childSegments = [...segments, name];
        if (isStateMigrationExcluded(childSegments)) continue;
        const from = NodePath.join(source, name);
        const to = NodePath.join(target, name);
        const info = yield* stat(from);
        if (!info) continue;
        if (info.isDirectory()) {
          yield* copyTree(from, to, childSegments, mode);
        } else if (mode.newerOnly) {
          const existing = yield* stat(to);
          if (!existing || info.mtimeMs > existing.mtimeMs) {
            yield* io(async () => {
              await NodeFSP.mkdir(NodePath.dirname(to), { recursive: true });
              await NodeFSP.copyFile(from, `${to}${PART_SUFFIX}`);
              await NodeFSP.rename(`${to}${PART_SUFFIX}`, to);
            });
          }
        } else {
          yield* copyFile(from, to, mode.overwrite);
        }
      }
    });

  const processEntry = (entry: StateMigrationEntry) =>
    Effect.gen(function* () {
      const segments = entry.relativePath.split("/");
      const target = NodePath.join(targetRoot, ...segments);
      const migrating = `${target}${MIGRATING_SUFFIX}`;
      const linkOld = `${target}${LINK_OLD_SUFFIX}`;
      const sourceInfo = yield* stat(entry.source);

      if (!sourceInfo) {
        // Old location deleted: never leave a dangling link behind; keep what was copied.
        const targetInfo = yield* lstat(target);
        if (targetInfo?.isSymbolicLink()) yield* io(() => NodeFSP.unlink(target));
        if ((yield* lstat(linkOld))?.isSymbolicLink()) {
          yield* io(() => NodeFSP.unlink(linkOld));
        }
        if ((yield* lstat(migrating)) && !(yield* lstat(target))) {
          yield* io(() => NodeFSP.rename(migrating, target));
        }
        entry.status = "lost";
        entry.error = `The old location '${entry.source}' no longer exists.`;
        return;
      }

      if (entry.mode === "copy") {
        yield* copyFile(entry.source, target, false);
        entry.status = "done";
        return;
      }
      if (entry.mode === "merge") {
        yield* copyTree(entry.source, target, segments, { overwrite: false });
        entry.status = "done";
        return;
      }

      // linked: finish a half-done swap first, from what is on disk.
      const targetInfo = yield* lstat(target);
      if (!targetInfo || targetInfo.isSymbolicLink()) {
        yield* copyTree(entry.source, migrating, segments, { overwrite: true });
        yield* withLock(
          Effect.gen(function* () {
            const current = yield* lstat(target);
            if (current?.isSymbolicLink()) {
              yield* io(() => NodeFSP.rename(target, linkOld));
            }
            if (!(yield* lstat(target))) {
              yield* io(() => NodeFSP.rename(migrating, target));
            }
          }),
        );
      }
      if ((yield* lstat(linkOld))?.isSymbolicLink()) {
        yield* io(() => NodeFSP.unlink(linkOld));
      }
      // Catch-up: writes that went through the link while the copy ran.
      yield* copyTree(entry.source, target, segments, { overwrite: false, newerOnly: true });
      if (yield* lstat(migrating)) {
        // A leftover from a swap another switch finished: merge it, then drop it.
        yield* copyTree(migrating, target, segments, { overwrite: false });
        yield* io(() => NodeFSP.rm(migrating, { recursive: true, force: true }));
      }
      entry.status = "done";
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          // A simulated crash must propagate like a real one; real errors fail just this entry.
          const squashed = Cause.squash(cause);
          if (squashed instanceof StateMigrationCrash) return yield* Effect.fail(squashed);
          entry.status = "failed";
          entry.error = String(
            squashed instanceof Error ? (squashed.cause ?? squashed.message) : squashed,
          ).slice(0, 500);
        }),
      ),
    );

  // A second switch may add entries while this runs: loop until nothing is pending, including
  // entries adopted at the final check.
  for (;;) {
    const next = journal.entries.find((entry) => entry.status === "pending");
    if (next) {
      yield* processEntry(next);
      yield* persist;
      continue;
    }
    const finished = yield* withLock(
      Effect.gen(function* () {
        if (!journal) return true;
        yield* adoptConcurrentEntries(journal);
        const done = !journal.entries.some((entry) => entry.status === "pending");
        if (done) journal.status = "done";
        options.onProgress?.(journal);
        yield* writeStateMigrationJournal(journal);
        return done;
      }),
    );
    if (finished) break;
  }
  return journal;
});
