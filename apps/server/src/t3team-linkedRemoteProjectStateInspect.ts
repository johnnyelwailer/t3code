/**
 * Targeted remote queries for a linked repository's committed project-state tree (`.nexi` /
 * `.t3team`) without materializing a full reference checkout. Uses a shallow fetch of the
 * default branch tip and `git ls-tree` on the remote ref — no blob checkout.
 *
 * **Committed-only:** this sees what is on the remote default branch, not uncommitted local
 * state. Callers that need local-only state must still inspect an on-disk checkout
 * (`detectMainRepositoryCandidates`).
 *
 * @module t3team-linkedRemoteProjectStateInspect
 */
import {
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import {
  CLONE_ENV,
  redactUrlCredentials,
  SourceControlRepositoryService,
} from "./sourceControl/SourceControlRepositoryService.ts";
import { INSPECT_TIMEOUT_MS, linkedCheckoutGit as git } from "./t3team-linkedCheckoutGit.ts";
import { hasProjectStateEntries } from "./t3team-project-repository-utils.ts";

export type RemoteProjectStateInspectResult = {
  /** Whether the default branch tree contains the active project state dir name. */
  readonly hasProjectStateDir: boolean;
  /** Entries under that directory on the remote tip (0 when absent). */
  readonly entryCount: number;
  readonly stateDirName: string;
  /** Always true for this module: only committed remote tree is visible. */
  readonly committedOnly: true;
  readonly source: "remote";
};

const REMOTE_FETCH_TIMEOUT_MS = INSPECT_TIMEOUT_MS;

const STATE_DIR_CANDIDATES: ReadonlyArray<string> = [
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
];

/** Committed project-state paths under `stateDirName`; machine-local bookkeeping that a repository
 * committed by accident (its `references/` manifest, child worktrees) is not project state. */
const projectStatePaths = (stdout: string, stateDirName: string): string[] =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) =>
      line.startsWith(`${stateDirName}/`) ? line.slice(stateDirName.length + 1) : line,
    )
    .filter((line) => line.length > 0 && hasProjectStateEntries([line]));

const notFound: RemoteProjectStateInspectResult = {
  hasProjectStateDir: false,
  entryCount: 0,
  stateDirName: PROJECT_STATE_DIR,
  committedOnly: true,
  source: "remote",
};

/** The remote could not be read (unreachable, refused credentials, timed out). */
export class RemoteProjectStateInspectError extends Schema.TaggedError<RemoteProjectStateInspectError>()(
  "RemoteProjectStateInspectError",
  { step: Schema.String, detail: Schema.String },
) {
  override get message(): string {
    return `git ${this.step} failed: ${redactUrlCredentials(this.detail)}`;
  }
}

/** Shallow-fetch `url`'s default branch in a temp git dir and count `.nexi`/`.t3team` entries.
 * Authenticates exactly as a linked clone does: the same prepared clone URL and the clone's env
 * (`CLONE_ENV`, git's own credential helper). A remote that cannot be read FAILS — only a read
 * that worked can say "no project state here". The temp dir is released on every exit. */
export const inspectRemoteProjectStateOnDefaultBranch = Effect.fn(
  "inspectRemoteProjectStateOnDefaultBranch",
)(function* (url: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const sourceControl = yield* SourceControlRepositoryService;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const scratchRoot = yield* Effect.acquireRelease(
        fileSystem.makeTempDirectory({ prefix: "t3-linked-remote-inspect-" }).pipe(Effect.orDie),
        (directory) =>
          fileSystem.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
      );
      const prepared = yield* sourceControl
        .prepareClone({ remoteUrl: url, destinationPath: scratchRoot })
        .pipe(Effect.orElseSucceed(() => ({ cloneUrl: url })));
      const cloneUrl = prepared.cloneUrl || url;
      yield* git("init", scratchRoot, ["init", "-q"], INSPECT_TIMEOUT_MS);
      const added = yield* git(
        "remote",
        scratchRoot,
        ["remote", "add", "origin", cloneUrl],
        INSPECT_TIMEOUT_MS,
        CLONE_ENV,
      );
      if (added.exitCode !== 0) {
        return yield* new RemoteProjectStateInspectError({
          step: "remote add",
          detail: added.stderr,
        });
      }
      const fetched = yield* git(
        "fetch",
        scratchRoot,
        ["fetch", "--depth", "1", "origin", "HEAD"],
        REMOTE_FETCH_TIMEOUT_MS,
        CLONE_ENV,
      );
      if (fetched.exitCode !== 0) {
        return yield* new RemoteProjectStateInspectError({ step: "fetch", detail: fetched.stderr });
      }
      const sym = yield* git(
        "symref",
        scratchRoot,
        ["symbolic-ref", "--short", "FETCH_HEAD"],
        INSPECT_TIMEOUT_MS,
      );
      const ref =
        sym.exitCode === 0 && sym.stdout.trim().length > 0 ? sym.stdout.trim() : "FETCH_HEAD";
      for (const stateDirName of STATE_DIR_CANDIDATES) {
        const tree = yield* git(
          "ls-tree",
          scratchRoot,
          ["ls-tree", "-r", "--name-only", `${ref}:${stateDirName}`],
          INSPECT_TIMEOUT_MS,
        );
        const paths = tree.exitCode === 0 ? projectStatePaths(tree.stdout, stateDirName) : [];
        if (paths.length > 0) {
          return {
            hasProjectStateDir: true,
            entryCount: paths.length,
            stateDirName,
            committedOnly: true,
            source: "remote",
          } satisfies RemoteProjectStateInspectResult;
        }
      }
      return notFound;
    }),
  );
});
