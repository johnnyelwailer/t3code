// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import {
  T3TeamLinkedRepositorySync,
  T3TeamLinkedRepositorySyncLive,
} from "./t3team-linkedRepositorySync.ts";
import { LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV } from "./t3team-lazyLinkedRepositoryFlag.ts";
import { MAIN_REPOSITORY_FLAG_ENV } from "./t3team-mainRepositoryFlag.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";
import { ensureLinkedRepositoryCheckout } from "./t3team-linkedRepositoryOnDemand.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });

const makeOrigin = (root: string, name: string) => {
  const origin = NodePath.join(root, "origins", name);
  NodeFS.mkdirSync(origin, { recursive: true });
  git(origin, "init", "-q", "-b", "main");
  NodeFS.writeFileSync(NodePath.join(origin, "a.txt"), "a\n");
  git(origin, "add", ".");
  git(origin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  return origin;
};

describe("lazy linked repository bootstrap", () => {
  it.live("bootstrap with five linked repos queues zero clones until on-demand", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-lazy-bootstrap-"));
    const workspaceRoot = NodePath.join(root, "workspace");
    NodeFS.mkdirSync(workspaceRoot, { recursive: true });
    const urls = ["one", "two", "three", "four", "five"].map((name) => makeOrigin(root, name));
    const counts = { clone: 0 };
    const vcs = Layer.succeed(VcsProcess, {
      run: (input) =>
        Effect.sync(() => {
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
        Effect.sync(() => {
          counts.clone += 1;
          git(root, "clone", "-q", input.remoteUrl ?? "", input.destinationPath);
          return { cwd: input.destinationPath, remoteUrl: input.remoteUrl ?? "", repository: null };
        }),
    } as never);
    const layer = T3TeamLinkedRepositorySyncLive.pipe(
      Layer.provideMerge(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)),
    );
    const previousLazy = process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV];
    const previousMain = process.env[MAIN_REPOSITORY_FLAG_ENV];
    process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV] = "1";
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "0";
    return Effect.gen(function* () {
      const response = yield* bootstrapWorkspaceReferences({
        workspaceRoot,
        workspaceRepositoryInitialized: true,
        detectedMainRepository: undefined,
        linkedRepositoryUrls: urls,
      });
      expect(response.linkedRepositories).toHaveLength(5);
      expect(response.linkedRepositories.every((entry) => entry.status === "pending")).toBe(true);
      expect(counts.clone).toBe(0);

      yield* ensureLinkedRepositoryCheckout({ workspaceRoot, repository: urls[0]! });
      expect(counts.clone).toBe(1);

      const sync = yield* T3TeamLinkedRepositorySync;
      yield* sync.awaitSettled(response.linkedRepositories[0]!.localPath);
      expect(counts.clone).toBe(1);
    }).pipe(
      Effect.provide(layer),
      Effect.ensuring(
        Effect.sync(() => {
          if (previousLazy === undefined)
            delete process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV];
          else process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV] = previousLazy;
          if (previousMain === undefined) delete process.env[MAIN_REPOSITORY_FLAG_ENV];
          else process.env[MAIN_REPOSITORY_FLAG_ENV] = previousMain;
          NodeFS.rmSync(root, { recursive: true, force: true });
        }),
      ),
    );
  });
});
