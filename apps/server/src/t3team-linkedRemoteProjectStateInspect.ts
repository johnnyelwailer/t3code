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
import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import { INSPECT_TIMEOUT_MS, linkedCheckoutGit as git } from "./t3team-linkedCheckoutGit.ts";

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

const countTreeEntries = (stdout: string): number =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;

/** Shallow-fetch `url`'s default branch in a temp git dir and count `.nexi`/`.t3team` entries. */
export const inspectRemoteProjectStateOnDefaultBranch = Effect.fn(
  "inspectRemoteProjectStateOnDefaultBranch",
)(function* (url: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const sourceControl = yield* SourceControlRepositoryService;
  const scratchRoot = yield* fileSystem
    .makeTempDirectory({ prefix: "t3-linked-remote-inspect-" })
    .pipe(Effect.orDie);
  const prepared = yield* sourceControl
    .prepareClone({ remoteUrl: url, destinationPath: scratchRoot })
    .pipe(
      Effect.catch(() =>
        Effect.succeed({
          cloneUrl: url,
          remoteUrl: url,
          destinationPath: scratchRoot,
          repository: null,
        }),
      ),
    );
  const cloneUrl = prepared.cloneUrl || url;
  yield* git("init", scratchRoot, ["init", "-q"], INSPECT_TIMEOUT_MS);
  yield* git("remote", scratchRoot, ["remote", "add", "origin", cloneUrl], INSPECT_TIMEOUT_MS);
  const fetched = yield* git(
    "fetch",
    scratchRoot,
    ["fetch", "--depth", "1", "origin", "HEAD"],
    REMOTE_FETCH_TIMEOUT_MS,
  );
  if (fetched.exitCode !== 0) {
    yield* fileSystem.remove(scratchRoot, { recursive: true, force: true }).pipe(Effect.ignore);
    return {
      hasProjectStateDir: false,
      entryCount: 0,
      stateDirName: PROJECT_STATE_DIR,
      committedOnly: true as const,
      source: "remote" as const,
    } satisfies RemoteProjectStateInspectResult;
  }
  const sym = yield* git(
    "symref",
    scratchRoot,
    ["symbolic-ref", "--short", "FETCH_HEAD"],
    INSPECT_TIMEOUT_MS,
  );
  const ref = sym.exitCode === 0 && sym.stdout.trim().length > 0 ? sym.stdout.trim() : "FETCH_HEAD";
  for (const stateDirName of STATE_DIR_CANDIDATES) {
    const tree = yield* git(
      "ls-tree",
      scratchRoot,
      ["ls-tree", "-r", "--name-only", `${ref}:${stateDirName}`],
      INSPECT_TIMEOUT_MS,
    );
    if (tree.exitCode === 0 && tree.stdout.trim().length > 0) {
      yield* fileSystem.remove(scratchRoot, { recursive: true, force: true }).pipe(Effect.ignore);
      return {
        hasProjectStateDir: true,
        entryCount: countTreeEntries(tree.stdout),
        stateDirName,
        committedOnly: true as const,
        source: "remote" as const,
      } satisfies RemoteProjectStateInspectResult;
    }
  }
  yield* fileSystem.remove(scratchRoot, { recursive: true, force: true }).pipe(Effect.ignore);
  return {
    hasProjectStateDir: false,
    entryCount: 0,
    stateDirName: PROJECT_STATE_DIR,
    committedOnly: true as const,
    source: "remote" as const,
  } satisfies RemoteProjectStateInspectResult;
});
