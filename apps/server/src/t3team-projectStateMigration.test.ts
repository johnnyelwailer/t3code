// @effect-diagnostics nodeBuiltinImport:off - temp state-dir fixtures use node fs helpers.
// @effect-diagnostics preferSchemaOverJson:off - journals are read back as raw JSON.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import {
  T3TeamLinkedRepositorySync,
  T3TeamLinkedRepositorySyncLive,
} from "./t3team-linkedRepositorySync.ts";
import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import {
  LINK_OLD_SUFFIX,
  MIGRATING_SUFFIX,
  planAndLinkStateMigration,
  planDirectoryLink,
  readStateMigrationJournal,
  StateMigrationIoError,
} from "./t3team-projectStateMigration.ts";
import { runStateMigration, StateMigrationCrash } from "./t3team-projectStateMigrationRun.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

const tempRoots: string[] = [];
const makeRoot = (prefix: string) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
};
afterAll(() => {
  for (const root of tempRoots) NodeFS.rmSync(root, { recursive: true, force: true });
});

const state = (root: string, ...segments: ReadonlyArray<string>) =>
  NodePath.join(root, HIDDEN_T3TEAM_DIR, ...segments);
const write = (file: string, contents: string) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
};
const isLink = (target: string) => NodeFS.lstatSync(target).isSymbolicLink();
const countFiles = (dir: string): number =>
  NodeFS.readdirSync(dir, { withFileTypes: true }).reduce(
    (total, entry) =>
      total + (entry.isDirectory() ? countFiles(NodePath.join(dir, entry.name)) : 1),
    0,
  );
const leftovers = (dir: string): string[] =>
  NodeFS.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
    (name) =>
      name.endsWith(MIGRATING_SUFFIX) ||
      name.endsWith(LINK_OLD_SUFFIX) ||
      name.endsWith(".nexi-part"),
  );

/** A project home with `files` research files, a blob cache, a Jira context file, and a target
 * checkout that already has its own (committed) `recipes`. */
const makeStates = (files = 50) => {
  const from = makeRoot("t3-state-from-");
  const to = makeRoot("t3-state-to-");
  for (let index = 0; index < files; index += 1) {
    write(
      state(from, "research", `part-${Math.floor(index / 100)}`, `note-${index}.md`),
      `n${index}\n`,
    );
  }
  for (let index = 0; index < 200; index += 1) {
    const sha = index.toString(16).padStart(64, "0");
    write(state(from, "context", "_blobs", sha.slice(0, 2), sha), `blob ${index}\n`);
  }
  write(state(from, "context", "jira", "IES-1.json"), "{}\n");
  write(state(from, "recipes", "generated", "recipe.ts"), "generated\n");
  write(state(from, "recipes", "home-only", "recipe.ts"), "home\n");
  write(state(from, "child-session-worktrees", "x", "file"), "worktree\n");
  write(state(from, "references", "reference-repositories.json"), "{}\n");
  write(state(to, "recipes", "generated", "recipe.ts"), "committed\n");
  return { from, to };
};

const fastRun = { throttleMs: 0 } as const;

const fakeSyncLayer = T3TeamLinkedRepositorySyncLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.succeed(VcsProcess, {} as never),
      Layer.succeed(SourceControlRepositoryService, {} as never),
      NodeServices.layer,
    ),
  ),
);

describe("planDirectoryLink (Windows junction rules)", () => {
  it("links with a junction to an absolute local path, normalized to backslashes", () => {
    expect(
      planDirectoryLink({
        platform: "win32",
        target: "C:/Users/pj/.t3code/projects/Nexi AI/.nexi/research",
        linkPath: "C:\\Users\\pj\\repo\\.nexi\\research",
      }),
    ).toEqual({
      kind: "junction",
      target: "C:\\Users\\pj\\.t3code\\projects\\Nexi AI\\.nexi\\research",
      linkPath: "C:\\Users\\pj\\repo\\.nexi\\research",
    });
  });
  it("cannot junction to or from a network share, or to a relative path", () => {
    expect(
      planDirectoryLink({ platform: "win32", target: "\\\\server\\share\\x", linkPath: "C:\\r\\x" })
        .kind,
    ).toBe("unsupported");
    expect(
      planDirectoryLink({ platform: "win32", target: "C:\\a\\x", linkPath: "\\\\server\\share\\x" })
        .kind,
    ).toBe("unsupported");
    expect(
      planDirectoryLink({ platform: "win32", target: "a\\x", linkPath: "C:\\r\\x" }).kind,
    ).toBe("unsupported");
  });
  it("uses a directory symlink on macOS and Linux", () => {
    expect(planDirectoryLink({ platform: "darwin", target: "/a/./b", linkPath: "/r/b" })).toEqual({
      kind: "dir",
      target: "/a/b",
      linkPath: "/r/b",
    });
    expect(planDirectoryLink({ platform: "linux", target: "b", linkPath: "/r/b" }).kind).toBe(
      "unsupported",
    );
  });
});

it.layer(NodeServices.layer)("project state migration", (it) => {
  it.effect("makes a large state available at once, then copies it in the background", () =>
    Effect.gen(function* () {
      const { from, to } = makeStates(20_000);
      const startedAt = performance.now();
      const journal = yield* planAndLinkStateMigration({ fromRoot: from, toRoot: to });
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeLessThan(500);
      // Readable at the new path right away, through links; nothing copied yet.
      expect(isLink(state(to, "research"))).toBe(true);
      expect(NodeFS.readFileSync(state(to, "research", "part-0", "note-0.md"), "utf8")).toBe(
        "n0\n",
      );
      expect(isLink(state(to, "recipes", "home-only"))).toBe(true);
      expect(NodeFS.readFileSync(state(to, "recipes", "generated", "recipe.ts"), "utf8")).toBe(
        "committed\n",
      );
      expect(NodeFS.existsSync(state(to, "child-session-worktrees"))).toBe(false);
      // The blob cache is readable through the `context` link meanwhile; it is never copied.
      expect(journal.status).toBe("running");

      const done = yield* runStateMigration(to, fastRun);
      expect(done?.status).toBe("done");
      expect(isLink(state(to, "research"))).toBe(false);
      expect(countFiles(state(to, "research"))).toBe(20_000);
      expect(isLink(state(to, "recipes", "home-only"))).toBe(false);
      expect(NodeFS.readFileSync(state(to, "context", "jira", "IES-1.json"), "utf8")).toBe("{}\n");
      expect(NodeFS.existsSync(state(to, "context", "_blobs"))).toBe(false);
      expect(NodeFS.readFileSync(state(to, "recipes", "generated", "recipe.ts"), "utf8")).toBe(
        "committed\n",
      );
      expect(leftovers(state(to))).toEqual([]);
      // The source is never touched.
      expect(countFiles(state(from, "research"))).toBe(20_000);
    }),
  );

  it.effect("resumes after a crash mid-copy and finishes a half-done swap", () =>
    Effect.gen(function* () {
      const { from, to } = makeStates(500);
      yield* planAndLinkStateMigration({ fromRoot: from, toRoot: to });
      const crashed = yield* Effect.exit(
        runStateMigration(to, { ...fastRun, crashAfterFiles: 120 }),
      );
      expect(Exit.isFailure(crashed)).toBe(true);
      expect(Exit.isFailure(crashed) && String(crashed.cause)).toContain("StateMigrationCrash");
      // Still readable through the link; the journal remembers the pending work.
      expect(isLink(state(to, "research"))).toBe(true);
      expect(NodeFS.existsSync(state(to, `research${MIGRATING_SUFFIX}`))).toBe(true);
      expect((yield* readStateMigrationJournal(to))?.status).toBe("running");

      const resumed = yield* runStateMigration(to, fastRun);
      expect(resumed?.status).toBe("done");
      expect(countFiles(state(to, "research"))).toBe(500);
      expect(leftovers(state(to))).toEqual([]);

      // A crash between the two renames of a swap: link moved aside, real folder not yet in place.
      const second = makeStates(30);
      yield* planAndLinkStateMigration({ fromRoot: second.from, toRoot: second.to });
      NodeFS.cpSync(
        state(second.from, "research"),
        state(second.to, `research${MIGRATING_SUFFIX}`),
        {
          recursive: true,
        },
      );
      NodeFS.renameSync(
        state(second.to, "research"),
        state(second.to, `research${LINK_OLD_SUFFIX}`),
      );
      const finished = yield* runStateMigration(second.to, fastRun);
      expect(finished?.status).toBe("done");
      expect(isLink(state(second.to, "research"))).toBe(false);
      expect(countFiles(state(second.to, "research"))).toBe(30);
      expect(leftovers(state(second.to))).toEqual([]);
      expect(countFiles(state(second.from, "research"))).toBe(30);
    }),
  );

  it.effect("copies files written through the link while the copy ran", () =>
    Effect.gen(function* () {
      const { from, to } = makeStates(10);
      yield* planAndLinkStateMigration({ fromRoot: from, toRoot: to });
      write(state(to, "research", "written-during-migration.md"), "late\n");
      yield* runStateMigration(to, fastRun);
      expect(isLink(state(to, "research"))).toBe(false);
      expect(
        NodeFS.readFileSync(state(to, "research", "written-during-migration.md"), "utf8"),
      ).toBe("late\n");
    }),
  );

  it.effect("handles a second switch while the first is still migrating, and a switch back", () =>
    Effect.gen(function* () {
      const { from: a, to: b } = makeStates(40);
      const c = makeRoot("t3-state-c-");
      // A -> B, not yet copied: B's state is links into A.
      yield* planAndLinkStateMigration({ fromRoot: a, toRoot: b });
      // B -> C: C links straight to A's real folders (no link chains).
      yield* planAndLinkStateMigration({ fromRoot: b, toRoot: c });
      expect(NodeFS.realpathSync(state(c, "research"))).toBe(
        NodeFS.realpathSync(state(a, "research")),
      );
      const cDone = yield* runStateMigration(c, fastRun);
      const bDone = yield* runStateMigration(b, fastRun);
      expect(cDone?.status).toBe("done");
      expect(bDone?.status).toBe("done");
      expect(countFiles(state(c, "research"))).toBe(40);
      expect(countFiles(state(b, "research"))).toBe(40);
      // C -> A: everything C has is already A's own (or older copies of it): nothing is linked
      // into A, and A never links to itself.
      const back = yield* planAndLinkStateMigration({ fromRoot: c, toRoot: a });
      expect(back.entries.filter((entry) => entry.mode === "linked")).toEqual([]);
      expect(isLink(state(a, "research"))).toBe(false);
      // A second planning into the same target while entries are pending does not duplicate them.
      const d = makeRoot("t3-state-d-");
      const first = yield* planAndLinkStateMigration({ fromRoot: a, toRoot: d });
      const again = yield* planAndLinkStateMigration({ fromRoot: a, toRoot: d });
      expect(again.entries.length).toBe(first.entries.length);
    }),
  );

  it.effect("drops dangling links when the old location is deleted", () =>
    Effect.gen(function* () {
      const { from, to } = makeStates(20);
      yield* planAndLinkStateMigration({ fromRoot: from, toRoot: to });
      NodeFS.rmSync(state(from, "research"), { recursive: true, force: true });
      const journal = yield* runStateMigration(to, fastRun);
      expect(journal?.status).toBe("done");
      const entry = journal?.entries.find((candidate) => candidate.relativePath === "research");
      expect(entry?.status).toBe("lost");
      expect(NodeFS.existsSync(state(to, "research"))).toBe(false);
      expect(() => NodeFS.lstatSync(state(to, "research"))).toThrow();
    }),
  );

  it.effect("falls back to a background copy where no link can be made", () =>
    Effect.gen(function* () {
      const { from, to } = makeStates(15);
      const journal = yield* planAndLinkStateMigration({
        fromRoot: from,
        toRoot: to,
        createLink: () => Effect.fail(new StateMigrationIoError({ cause: "EPERM" })),
      });
      expect(journal.entries.find((entry) => entry.relativePath === "research")?.mode).toBe(
        "merge",
      );
      expect(NodeFS.existsSync(state(to, "research"))).toBe(false);
      yield* runStateMigration(to, fastRun);
      expect(countFiles(state(to, "research"))).toBe(15);
    }),
  );
});

it.layer(fakeSyncLayer)("state migration service", (it) => {
  it.effect("starts at once, reports progress, and never takes the manifest lock", () =>
    Effect.gen(function* () {
      const sync = yield* T3TeamLinkedRepositorySync;
      const { from, to } = makeStates(3_000);
      // Held for the whole migration: a linked-repository request must not wait on it.
      const startedAt = performance.now();
      const summary = yield* sync.withManifestLock(
        Effect.gen(function* () {
          return yield* sync.startStateMigration({ fromRoot: from, toRoot: to });
        }),
      );
      expect(performance.now() - startedAt).toBeLessThan(500);
      expect(summary?.status).toBe("running");
      const lockFree = yield* sync.withManifestLock(Effect.succeed("free"));
      expect(lockFree).toBe("free");
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const status = yield* sync.stateMigrationStatus(to);
        if (status?.status === "done") break;
        // The job's throttle sleeps run on the test clock; file I/O needs real time.
        yield* TestClock.adjust(Duration.millis(50));
        // @effect-diagnostics-next-line globalTimers:off
        yield* Effect.promise(() => new Promise((resolve) => setTimeout(resolve, 20)));
      }
      expect((yield* sync.stateMigrationStatus(to))?.status).toBe("done");
      expect(countFiles(state(to, "research"))).toBe(3_000);
      // A finished journal is not re-run on resume.
      yield* sync.resumeStateMigration(to);
      expect((yield* sync.stateMigrationStatus(to))?.status).toBe("done");
    }),
  );
});

void StateMigrationCrash;
