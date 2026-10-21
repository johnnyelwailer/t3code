// @effect-diagnostics nodeBuiltinImport:off -- directory junctions/symlinks and lstat are not in effect/FileSystem.
/**
 * The instant phase of a main-repository switch: links every state directory the new checkout
 * lacks to the old one (a junction on Windows, a directory symlink elsewhere) and records the
 * plan in the journal for the background job. See `t3team-projectStateMigration.ts`.
 *
 * @module t3team-projectStateMigrationLink
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import {
  io,
  isStateMigrationExcluded,
  readStateMigrationJournal,
  StateMigrationIoError,
  type StateMigrationEntry,
  type StateMigrationJournal,
  writeStateMigrationJournal,
} from "./t3team-projectStateMigration.ts";

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
