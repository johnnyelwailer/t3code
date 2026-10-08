// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import {
  T3TeamLinkedRepositorySync,
  T3TeamLinkedRepositorySyncLive,
} from "./t3team-linkedRepositorySync.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";
import { readLinkedRepositoryStatus } from "./t3team-project-repository-routesStatus.ts";
import {
  deriveReferenceDirectoryName,
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { isSameRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });

const makeOrigin = (root: string, name: string) => {
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
const makeHarness = () => {
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

const bootstrap = (workspaceRoot: string, urls: ReadonlyArray<string>, refresh = false) =>
  bootstrapWorkspaceReferences({
    workspaceRoot,
    workspaceRepositoryInitialized: true,
    detectedMainRepository: undefined,
    linkedRepositoryUrls: urls,
    ...(refresh ? { refreshLinkedRepositories: true } : {}),
  });

const settleAll = (paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sync = yield* T3TeamLinkedRepositorySync;
    yield* Effect.forEach(paths, (path) => sync.awaitSettled(path), { discard: true });
  });

describe("T3TeamLinkedRepositorySync", () => {
  it.live("saving returns before slow clones finish, then records them as cloned", () => {
    const harness = makeHarness();
    const urls = ["one", "two", "three"].map((name) => makeOrigin(harness.root, name));
    return Effect.gen(function* () {
      const gate = yield* harness.holdClones();
      const response = yield* bootstrap(harness.workspaceRoot, urls, true);
      expect(response.linkedRepositories.map((entry) => entry.status)).toEqual([
        "pending",
        "pending",
        "pending",
      ]);
      expect(response.linkedRepositories.every((entry) => entry.syncState)).toBe(true);
      yield* Deferred.succeed(gate, undefined);
      yield* settleAll(response.linkedRepositories.map((entry) => entry.localPath));
      const status = yield* readLinkedRepositoryStatus(harness.workspaceRoot);
      expect(status.linkedRepositories.map((entry) => entry.status)).toEqual([
        "cloned",
        "cloned",
        "cloned",
      ]);
      for (const entry of status.linkedRepositories) {
        expect(NodeFS.existsSync(NodePath.join(entry.localPath, "a.txt"))).toBe(true);
        expect(entry.syncState).toBeUndefined();
      }
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("a client disconnect does not interrupt a running clone", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "solo");
    return Effect.gen(function* () {
      const gate = yield* harness.holdClones();
      // The request fiber queues the sync, then is interrupted mid-flight (a 499 / aborted fetch).
      const request = yield* Effect.forkChild(
        Effect.andThen(bootstrap(harness.workspaceRoot, [url], true), Effect.never),
      );
      while (harness.cloneStarted.length === 0) yield* Effect.sleep("5 millis");
      yield* Fiber.interrupt(request);
      yield* Deferred.succeed(gate, undefined);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      yield* settleAll([entry!.localPath]);
      const [settled] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
        .linkedRepositories;
      expect(settled?.status).toBe("cloned");
      expect(NodeFS.existsSync(NodePath.join(settled!.localPath, "c.txt"))).toBe(true);
      // The clone landed through a temp directory; none is left behind.
      const siblings = NodeFS.readdirSync(NodePath.dirname(settled!.localPath));
      expect(siblings.some((name) => name.includes(".clone-"))).toBe(false);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("repairs a half-checked-out clone instead of reporting it ready", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "half");
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      // An interrupted legacy clone: objects present, most of the work tree gone.
      NodeFS.rmSync(NodePath.join(localPath, "a.txt"));
      NodeFS.rmSync(NodePath.join(localPath, "b.txt"));
      // A local edit and the index survive the repair: only missing files are written back.
      NodeFS.writeFileSync(NodePath.join(localPath, "c.txt"), "edited\n");
      NodeFS.rmSync(NodePath.join(localPath, ".git", "index"));
      yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([localPath]);
      expect(NodeFS.existsSync(NodePath.join(localPath, "a.txt"))).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(localPath, "b.txt"))).toBe(true);
      expect(NodeFS.readFileSync(NodePath.join(localPath, "c.txt"), "utf8")).toBe("edited\n");
      expect(harness.counts.clone).toBe(1);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.status).toBe("updated");
      expect(entry?.error).toBeUndefined();
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("re-clones a checkout whose HEAD cannot be resolved", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "headless");
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      NodeFS.rmSync(NodePath.join(localPath, ".git", "refs"), { recursive: true, force: true });
      NodeFS.rmSync(NodePath.join(localPath, ".git", "packed-refs"), { force: true });
      yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([localPath]);
      expect(harness.counts.clone).toBe(2);
      expect(git(localPath, "rev-parse", "--verify", "HEAD").status).toBe(0);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("deduplicates concurrent syncs of one repository and bounds parallelism", () => {
    const harness = makeHarness();
    const urls = ["r1", "r2", "r3", "r4", "r5"].map((name) => makeOrigin(harness.root, name));
    return Effect.gen(function* () {
      const gate = yield* harness.holdClones();
      const first = yield* bootstrap(harness.workspaceRoot, urls, true);
      yield* bootstrap(harness.workspaceRoot, urls, true);
      yield* bootstrap(harness.workspaceRoot, urls, true);
      while (harness.cloneStarted.length < 3) yield* Effect.sleep("5 millis");
      yield* Effect.sleep("50 millis");
      expect(harness.counts.activeClones).toBe(3);
      yield* Deferred.succeed(gate, undefined);
      yield* settleAll(first.linkedRepositories.map((entry) => entry.localPath));
      expect(harness.counts.clone).toBe(5);
      expect(harness.counts.maxActiveClones).toBe(3);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("re-bootstraps and status polls do no git network work", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "quiet");
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([first.linkedRepositories[0]!.localPath]);
      const before = { ...harness.counts };
      for (let poll = 0; poll < 5; poll += 1) {
        const again = yield* bootstrap(harness.workspaceRoot, [url]);
        expect(again.linkedRepositories[0]?.syncState).toBeUndefined();
        yield* readLinkedRepositoryStatus(harness.workspaceRoot);
      }
      expect(harness.counts.fetch).toBe(before.fetch);
      expect(harness.counts.clone).toBe(before.clone);
      // An explicit save still refetches.
      yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([first.linkedRepositories[0]!.localPath]);
      expect(harness.counts.fetch).toBe(before.fetch + 1);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("a status read re-queues a pending entry whose sync was lost to a restart", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "orphan");
    return Effect.gen(function* () {
      const referencesRoot = NodePath.join(
        harness.workspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
      );
      const localPath = NodePath.join(referencesRoot, "01-orphan");
      NodeFS.mkdirSync(referencesRoot, { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(referencesRoot, MANIFEST_FILE_NAME),
        `{"linkedRepositories":[{"url":"${url}","localPath":"${localPath}","status":"pending"}]}`,
      );
      const first = yield* readLinkedRepositoryStatus(harness.workspaceRoot);
      expect(first.linkedRepositories[0]?.syncState).toBeDefined();
      yield* settleAll([localPath]);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.status).toBe("cloned");
      expect(harness.counts.clone).toBe(1);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("never reports a checkout of a different repository as ready", () => {
    const harness = makeHarness();
    const wanted = makeOrigin(harness.root, "wanted");
    const other = makeOrigin(harness.root, "other");
    return Effect.gen(function* () {
      const referencesRoot = NodePath.join(
        harness.workspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
      );
      const localPath = NodePath.join(referencesRoot, `01-${deriveReferenceDirectoryName(wanted)}`);
      NodeFS.mkdirSync(referencesRoot, { recursive: true });
      git(harness.root, "clone", "-q", other, localPath);
      const first = yield* bootstrap(harness.workspaceRoot, [wanted], true);
      expect(first.linkedRepositories[0]?.localPath).toBe(localPath);
      yield* settleAll([localPath]);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.status).toBe("failed");
      expect(entry?.error).toContain("different repository");
      expect(harness.counts.fetch).toBe(0);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it("compares repository identity across spellings but not across hosts", () => {
    expect(isSameRepository("https://github.com/a/b.git", "git@github.com:a/b")).toBe(true);
    expect(isSameRepository("https://github.com/a/b", "https://gitlab.com/a/b")).toBe(false);
    expect(isSameRepository("a/b", "https://github.com/a/b")).toBe(true);
  });

  it.live("fails closed on a reference checkout without an origin remote", () => {
    const harness = makeHarness();
    const wanted = makeOrigin(harness.root, "remoteless");
    return Effect.gen(function* () {
      const referencesRoot = NodePath.join(
        harness.workspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
      );
      const localPath = NodePath.join(referencesRoot, `01-${deriveReferenceDirectoryName(wanted)}`);
      NodeFS.mkdirSync(referencesRoot, { recursive: true });
      git(harness.root, "clone", "-q", wanted, localPath);
      git(localPath, "remote", "remove", "origin");
      yield* bootstrap(harness.workspaceRoot, [wanted], true);
      yield* settleAll([localPath]);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.status).toBe("failed");
      expect(entry?.error).toContain("without an origin");
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("re-clones a broken checkout without an origin instead of repairing it in place", () => {
    const harness = makeHarness();
    const wanted = makeOrigin(harness.root, "wanted-two");
    const other = makeOrigin(harness.root, "unrelated");
    return Effect.gen(function* () {
      const referencesRoot = NodePath.join(
        harness.workspaceRoot,
        HIDDEN_T3TEAM_DIR,
        REFERENCES_DIR_NAME,
      );
      const localPath = NodePath.join(referencesRoot, `01-${deriveReferenceDirectoryName(wanted)}`);
      NodeFS.mkdirSync(referencesRoot, { recursive: true });
      git(harness.root, "clone", "-q", other, localPath);
      git(localPath, "remote", "remove", "origin");
      NodeFS.rmSync(NodePath.join(localPath, ".git", "index"));
      yield* bootstrap(harness.workspaceRoot, [wanted], true);
      yield* settleAll([localPath]);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.status).toBe("cloned");
      expect(git(localPath, "remote", "get-url", "origin").stdout.trim()).toBe(wanted);
      // The unrelated tree is kept aside, not deleted.
      const aside = NodeFS.readdirSync(referencesRoot).filter((name) => name.includes(".broken-"));
      expect(aside).toHaveLength(1);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });
});
