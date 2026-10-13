// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";

import {
  addBranch,
  bootstrap,
  currentBranch,
  git,
  makeHarness,
  makeOrigin,
  settleAll,
} from "./t3team-linkedRepositorySync.fixtures.ts";
import { listLinkedRepositoryBranches } from "./t3team-project-repository-routesBranches.ts";
import { readLinkedRepositoryStatus } from "./t3team-project-repository-routesStatus.ts";
import {
  deriveReferenceDirectoryName,
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { MAIN_REPOSITORY_GITIGNORE_ENTRIES } from "./t3team-project-repository-utils.ts";
import { isSameRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

describe("T3TeamLinkedRepositorySync", () => {
  it.live("saving returns before slow clones finish, then records them as cloned", () => {
    const harness = makeHarness();
    const urls = ["one", "two", "three"].map((name) => makeOrigin(harness.root, name));
    return Effect.gen(function* () {
      const gate = yield* harness.holdClones();
      const response = yield* bootstrap(harness.workspaceRoot, urls, true);
      expect(response.linkedRepositories.map((entry) => entry.status)).toEqual([
        "not-cloned",
        "not-cloned",
        "not-cloned",
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

  it.live(
    "adopts a finished clone an earlier attempt could not publish instead of cloning again",
    () => {
      const harness = makeHarness();
      const url = makeOrigin(harness.root, "adopt");
      return Effect.gen(function* () {
        // First attempt: a clone that finishes, then is left behind as a temp directory (publishing failed).
        const first = yield* bootstrap(harness.workspaceRoot, [url], true);
        const localPath = first.linkedRepositories[0]!.localPath;
        yield* settleAll([localPath]);
        expect(harness.counts.clone).toBe(1);
        const leftover = NodePath.join(
          NodePath.dirname(localPath),
          `.${NodePath.basename(localPath)}.clone-abcd1234`,
        );
        NodeFS.renameSync(localPath, leftover);

        yield* bootstrap(harness.workspaceRoot, [url], true);
        yield* settleAll([localPath]);

        expect(harness.counts.clone).toBe(1);
        expect(NodeFS.existsSync(NodePath.join(localPath, "a.txt"))).toBe(true);
        expect(NodeFS.existsSync(leftover)).toBe(false);
        const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
          .linkedRepositories;
        expect(entry?.status).toBe("cloned");
      }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
    },
  );

  it.live("discards a half-finished leftover clone and clones fresh", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "partial");
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      const leftover = NodePath.join(
        NodePath.dirname(localPath),
        `.${NodePath.basename(localPath)}.clone-ffff0000`,
      );
      NodeFS.mkdirSync(NodePath.join(leftover, ".git"), { recursive: true });
      NodeFS.rmSync(localPath, { recursive: true, force: true });

      yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([localPath]);

      expect(harness.counts.clone).toBe(2);
      expect(NodeFS.existsSync(NodePath.join(localPath, "a.txt"))).toBe(true);
      expect(NodeFS.existsSync(leftover)).toBe(false);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live(
    "keeps a healthy clone on disk when its manifest entry is gone and the list reorders",
    () => {
      const harness = makeHarness();
      const url = makeOrigin(harness.root, "keeper");
      const other = makeOrigin(harness.root, "newcomer");
      return Effect.gen(function* () {
        const first = yield* bootstrap(harness.workspaceRoot, [url], true);
        const keeperPath = first.linkedRepositories[0]!.localPath;
        yield* settleAll([keeperPath]);
        NodeFS.rmSync(NodePath.join(NodePath.dirname(keeperPath), MANIFEST_FILE_NAME));

        const second = yield* bootstrap(harness.workspaceRoot, [other, url], true);
        yield* settleAll(second.linkedRepositories.map((entry) => entry.localPath));

        expect(second.linkedRepositories[1]?.localPath).toBe(keeperPath);
        expect(harness.counts.clone).toBe(2);
      }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
    },
  );

  it.live("clones onto the chosen branch and records it", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "branched");
    addBranch(url, "feature/pj", { "skill.txt": "from the branch\n" });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true, { [url]: "feature/pj" });
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      expect(currentBranch(localPath)).toBe("feature/pj");
      expect(NodeFS.existsSync(NodePath.join(localPath, "skill.txt"))).toBe(true);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.branch).toBe("feature/pj");
      expect(entry?.error).toBeUndefined();
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("moves an existing checkout to the chosen branch without cloning again", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "switch");
    addBranch(url, "feature/pj", { "skill.txt": "from the branch\n" });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      expect(currentBranch(localPath)).toBe("main");

      yield* bootstrap(harness.workspaceRoot, [url], false, { [url]: "feature/pj" });
      yield* settleAll([localPath]);
      expect(currentBranch(localPath)).toBe("feature/pj");
      expect(harness.counts.clone).toBe(1);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("clears T3's own scaffold out of the way when it blocks the switch", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "scaffold");
    addBranch(url, "feature/pj", {
      "AGENTS.md": "the branch's own\n",
      ".gitignore": "node_modules/\n*.log\n",
    });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      NodeFS.writeFileSync(NodePath.join(localPath, "AGENTS.md"), "scaffolded by T3\n");
      NodeFS.writeFileSync(
        NodePath.join(localPath, ".gitignore"),
        `${MAIN_REPOSITORY_GITIGNORE_ENTRIES[0]}\n`,
      );

      yield* bootstrap(harness.workspaceRoot, [url], false, { [url]: "feature/pj" });
      yield* settleAll([localPath]);
      const [outcome] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
        .linkedRepositories;
      expect(outcome?.error).toBeUndefined();
      expect(currentBranch(localPath)).toBe("feature/pj");
      expect(NodeFS.readFileSync(NodePath.join(localPath, "AGENTS.md"), "utf8")).toBe(
        "the branch's own\n",
      );
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.error).toBeUndefined();
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live(
    "leaves a checkout alone, and says why, when the user's own edits block the switch",
    () => {
      const harness = makeHarness();
      const url = makeOrigin(harness.root, "edited");
      addBranch(url, "feature/pj", { "a.txt": "changed on the branch\n" });
      return Effect.gen(function* () {
        const first = yield* bootstrap(harness.workspaceRoot, [url], true);
        const localPath = first.linkedRepositories[0]!.localPath;
        yield* settleAll([localPath]);
        NodeFS.writeFileSync(NodePath.join(localPath, "a.txt"), "my own edit\n");

        yield* bootstrap(harness.workspaceRoot, [url], false, { [url]: "feature/pj" });
        yield* settleAll([localPath]);
        expect(currentBranch(localPath)).toBe("main");
        expect(NodeFS.readFileSync(NodePath.join(localPath, "a.txt"), "utf8")).toBe(
          "my own edit\n",
        );
        const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
          .linkedRepositories;
        expect(entry?.error).toContain('Could not switch to "feature/pj"');
        expect(entry?.status).toBe("updated");
      }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
    },
  );

  it.live("reverts the scaffold edit to a tracked .gitignore when it blocks the switch", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "tracked-ignore");
    NodeFS.writeFileSync(NodePath.join(url, ".gitignore"), "node_modules/\n");
    git(url, "add", ".");
    git(url, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "ignore");
    addBranch(url, "feature/pj", { ".gitignore": "node_modules/\n*.log\n" });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true);
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      NodeFS.appendFileSync(
        NodePath.join(localPath, ".gitignore"),
        `${MAIN_REPOSITORY_GITIGNORE_ENTRIES[0]}\n`,
      );

      yield* bootstrap(harness.workspaceRoot, [url], false, { [url]: "feature/pj" });
      yield* settleAll([localPath]);
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.error).toBeUndefined();
      expect(currentBranch(localPath)).toBe("feature/pj");
      expect(NodeFS.readFileSync(NodePath.join(localPath, ".gitignore"), "utf8")).toBe(
        "node_modules/\n*.log\n",
      );
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("lists the branches a checkout knows, with the current and the default one", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "listing");
    addBranch(url, "feature/pj", { "skill.txt": "from the branch\n" });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true, { [url]: "feature/pj" });
      yield* settleAll([first.linkedRepositories[0]!.localPath]);
      const listed = yield* listLinkedRepositoryBranches(harness.workspaceRoot, url);
      expect(listed.branches).toEqual(["feature/pj", "main"]);
      expect(listed.current).toBe("feature/pj");
      expect(listed.defaultBranch).toBe("main");
      const unknown = yield* listLinkedRepositoryBranches(
        harness.workspaceRoot,
        "https://example.com/x/y",
      );
      expect(unknown.branches).toEqual([]);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("reports a branch that is not on the remote and keeps the checkout usable", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "missing-branch");
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true, { [url]: "nope" });
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      expect(currentBranch(localPath)).toBe("main");
      const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot)).linkedRepositories;
      expect(entry?.error).toContain('"nope" does not exist on the remote');
      expect(entry?.status).toBe("cloned");
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("fast-forwards the chosen branch on a later sync", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "forward");
    addBranch(url, "feature/pj", { "one.txt": "1\n" });
    return Effect.gen(function* () {
      const first = yield* bootstrap(harness.workspaceRoot, [url], true, { [url]: "feature/pj" });
      const localPath = first.linkedRepositories[0]!.localPath;
      yield* settleAll([localPath]);
      addBranch(url, "feature/pj-next", {});
      git(url, "checkout", "-q", "feature/pj");
      NodeFS.writeFileSync(NodePath.join(url, "two.txt"), "2\n");
      git(url, "add", ".");
      git(url, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "more");

      yield* bootstrap(harness.workspaceRoot, [url], true, { [url]: "feature/pj" });
      yield* settleAll([localPath]);
      expect(NodeFS.existsSync(NodePath.join(localPath, "two.txt"))).toBe(true);
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
      // An explicit sync request still refetches.
      yield* bootstrap(harness.workspaceRoot, [url], true);
      yield* settleAll([first.linkedRepositories[0]!.localPath]);
      expect(harness.counts.fetch).toBe(before.fetch + 1);
    }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));
  });

  it.live("a status read never queues a sync, not even for a legacy pending entry", () => {
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
        JSON.stringify({ linkedRepositories: [{ url, localPath, status: "pending" }] }),
      );
      const first = yield* readLinkedRepositoryStatus(harness.workspaceRoot);
      expect(first.linkedRepositories[0]?.syncState).toBeUndefined();
      expect(first.linkedRepositories[0]?.status).toBe("pending");
      expect(harness.counts.clone).toBe(0);
      expect(NodeFS.existsSync(localPath)).toBe(false);
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
