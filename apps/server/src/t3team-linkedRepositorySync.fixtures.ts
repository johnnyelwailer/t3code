// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
/**
 * Real-git harness for the linked-repository sync tests: temp origins, a sync service behind
 * fakes that count clones/fetches and can hold a clone open, and a bootstrap helper.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import {
  T3TeamLinkedRepositorySync,
  T3TeamLinkedRepositorySyncLive,
} from "./t3team-linkedRepositorySync.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

export const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });

export const makeOrigin = (root: string, name: string) => {
  const origin = NodePath.join(root, "origins", name);
  NodeFS.mkdirSync(origin, { recursive: true });
  git(origin, "init", "-q", "-b", "main");
  for (const file of ["a.txt", "b.txt", "c.txt"]) {
    NodeFS.writeFileSync(NodePath.join(origin, file), `${file}\n`);
  }
  git(origin, "add", ".");
  git(origin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  return origin;
};

/** Real git behind fakes that count work and can hold a clone open. */
export const makeHarness = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-linked-sync-"));
  const workspaceRoot = NodePath.join(root, "workspace");
  NodeFS.mkdirSync(workspaceRoot, { recursive: true });
  const counts = { clone: 0, fetch: 0, activeClones: 0, maxActiveClones: 0 };
  let cloneGate: Deferred.Deferred<void> | undefined;
  const cloneStarted: Array<string> = [];
  const vcs = Layer.succeed(VcsProcess, {
    run: (input) =>
      Effect.sync(() => {
        if (input.args[0] === "fetch") counts.fetch += 1;
        const result = git(input.cwd, ...input.args);
        return {
          exitCode: (result.status ?? 1) as never,
          stdout: result.stdout,
          stderr: result.stderr,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      }),
  });
  const sourceControl = Layer.succeed(SourceControlRepositoryService, {
    cloneRepository: (input: { remoteUrl?: string; destinationPath: string }) =>
      Effect.gen(function* () {
        counts.clone += 1;
        counts.activeClones += 1;
        counts.maxActiveClones = Math.max(counts.maxActiveClones, counts.activeClones);
        cloneStarted.push(input.destinationPath);
        if (cloneGate) yield* Deferred.await(cloneGate);
        git(root, "clone", "-q", input.remoteUrl ?? "", input.destinationPath);
        return { cwd: input.destinationPath, remoteUrl: input.remoteUrl ?? "", repository: null };
      }).pipe(Effect.ensuring(Effect.sync(() => (counts.activeClones -= 1)))),
  } as never);
  const layer = T3TeamLinkedRepositorySyncLive.pipe(
    Layer.provideMerge(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)),
  );
  return {
    root,
    workspaceRoot,
    counts,
    cloneStarted,
    layer,
    holdClones: () =>
      Effect.map(Deferred.make<void>(), (gate) => {
        cloneGate = gate;
        return gate;
      }),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

export const bootstrap = (
  workspaceRoot: string,
  urls: ReadonlyArray<string>,
  /** Sync every listed repository now (an explicit request); otherwise they are only recorded. */
  syncAll = false,
  branches?: Readonly<Record<string, string>>,
) =>
  bootstrapWorkspaceReferences({
    workspaceRoot,
    workspaceRepositoryInitialized: true,
    detectedMainRepository: undefined,
    linkedRepositoryUrls: urls,
    ...(branches ? { linkedRepositoryBranches: branches } : {}),
    ...(syncAll ? { syncLinkedRepositoryUrls: urls } : {}),
  });

/** A branch on the origin with its own files, then back on main so clones start there. */
export const addBranch = (origin: string, name: string, files: Record<string, string>) => {
  git(origin, "checkout", "-q", "-b", name);
  for (const [file, contents] of Object.entries(files)) {
    NodeFS.writeFileSync(NodePath.join(origin, file), contents);
  }
  git(origin, "add", ".");
  git(origin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", `on ${name}`);
  git(origin, "checkout", "-q", "main");
};

export const currentBranch = (directory: string) =>
  git(directory, "rev-parse", "--abbrev-ref", "HEAD").stdout.trim();

export const settleAll = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sync = yield* T3TeamLinkedRepositorySync;
    yield* Effect.forEach(paths, (path) => sync.awaitSettled(path), { discard: true });
  });
