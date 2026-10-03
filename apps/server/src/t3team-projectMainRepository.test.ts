// @effect-diagnostics nodeBuiltinImport:off - temp git fixtures use node fs/child_process helpers.
// @effect-diagnostics preferSchemaOverJson:off - manifest fixtures are read back as raw JSON.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { isMainRepositoryEnabled, MAIN_REPOSITORY_FLAG_ENV } from "./t3team-mainRepositoryFlag.ts";
import { detectMainRepository } from "./t3team-project-repository-services.ts";
import { mergeLinkedRepositoryEntries } from "./t3team-project-repository-routesBootstrap.ts";
import {
  GITIGNORE_ENTRY,
  HIDDEN_T3TEAM_DIR,
  MAIN_REPOSITORY_GITIGNORE_ENTRIES,
} from "./t3team-project-repository-utils.ts";
import {
  detectMainRepositoryCandidates,
  migrateProjectStateDir,
} from "./t3team-projectMainRepositoryState.ts";
import { switchProjectMainRepository } from "./t3team-projectMainRepositorySwitch.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

const TestLayer = Layer.mergeAll(
  VcsProcess.layer.pipe(Layer.provide(NodeServices.layer)),
  NodeServices.layer,
);

const tempRoots: string[] = [];
const makeTempRoot = (prefix: string) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
};
afterAll(() => {
  for (const root of tempRoots) NodeFS.rmSync(root, { recursive: true, force: true });
});

/** Pins `NEXI_FF_MAIN_REPOSITORY` for the rest of the enclosing test; restored on scope close. */
const withMainRepositoryFlag = (value: string | undefined) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const previous = process.env[MAIN_REPOSITORY_FLAG_ENV];
      if (value === undefined) delete process.env[MAIN_REPOSITORY_FLAG_ENV];
      else process.env[MAIN_REPOSITORY_FLAG_ENV] = value;
      return previous;
    }),
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) delete process.env[MAIN_REPOSITORY_FLAG_ENV];
        else process.env[MAIN_REPOSITORY_FLAG_ENV] = previous;
      }),
  );

const git = (cwd: string, args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync("git", [...args], { cwd, stdio: "pipe" });

const initRepo = (root: string, commit: boolean) => {
  NodeFS.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  if (!commit) return;
  git(root, ["config", "user.email", "eval@test.com"]);
  git(root, ["config", "user.name", "Eval"]);
  NodeFS.writeFileSync(NodePath.join(root, "README.md"), "# repo\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "initial"]);
};

const write = (file: string, contents: string) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
};

const state = (root: string, ...segments: ReadonlyArray<string>) =>
  NodePath.join(root, HIDDEN_T3TEAM_DIR, ...segments);

/** A managed project home with two linked clones, `alpha` already carrying project state. */
const makeProject = () => {
  const home = makeTempRoot("t3-main-repo-");
  const alpha = state(home, "references", "01-alpha");
  const beta = state(home, "references", "02-beta");
  initRepo(alpha, true);
  initRepo(beta, true);
  write(state(alpha, "recipes", "committed", "recipe.ts"), "committed\n");
  write(state(home, "context", "entrypoint.json"), "{}\n");
  write(state(home, "recipes", "committed", "recipe.ts"), "generated\n");
  write(state(home, "child-session-worktrees", "x", "file"), "worktree\n");
  const linkedRepositories = [
    { url: "https://github.com/acme/alpha", localPath: alpha, status: "cloned" as const },
    { url: "https://github.com/acme/beta", localPath: beta, status: "cloned" as const },
  ];
  write(
    state(home, "references", "reference-repositories.json"),
    JSON.stringify({ linkedRepositories }),
  );
  return { home, alpha, beta, linkedRepositories };
};

it.layer(TestLayer)("project main repository", (it) => {
  it("is off unless NEXI_FF_MAIN_REPOSITORY is explicitly on", () => {
    expect(isMainRepositoryEnabled(() => undefined)).toBe(false);
    expect(isMainRepositoryEnabled(() => "0")).toBe(false);
    expect(isMainRepositoryEnabled(() => "true")).toBe(true);
  });

  it.effect("detects only linked clones that already carry a state dir", () =>
    Effect.gen(function* () {
      const { alpha, linkedRepositories } = makeProject();
      const candidates = yield* detectMainRepositoryCandidates([
        ...linkedRepositories,
        { url: "https://github.com/acme/broken", localPath: alpha, status: "failed" },
      ]);
      expect(candidates).toEqual([{ url: "https://github.com/acme/alpha", checkoutPath: alpha }]);
    }),
  );

  it.effect("migrates state without clones, worktrees, or overwriting target files", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject();
      const copied = yield* migrateProjectStateDir({ fromRoot: home, toRoot: alpha });
      expect(copied.toSorted()).toEqual([
        "context/entrypoint.json",
        "references/reference-repositories.json",
      ]);
      expect(NodeFS.readFileSync(state(alpha, "recipes", "committed", "recipe.ts"), "utf8")).toBe(
        "committed\n",
      );
      expect(NodeFS.existsSync(state(alpha, "child-session-worktrees"))).toBe(false);
      expect(NodeFS.existsSync(state(home, "context", "entrypoint.json"))).toBe(true);
    }),
  );

  it.effect("switches to a linked clone, records it in the manifest, and can switch back", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject();
      const switched = yield* switchProjectMainRepository({
        project: { workspaceRoot: home },
        url: "https://github.com/acme/alpha",
        selection: "detected",
      });
      expect(switched).toMatchObject({
        changed: true,
        workspaceRoot: alpha,
        mainRepository: {
          url: "https://github.com/acme/alpha",
          checkoutPath: alpha,
          projectRoot: home,
          selection: "detected",
        },
      });
      const manifest = JSON.parse(
        NodeFS.readFileSync(state(alpha, "references", "reference-repositories.json"), "utf8"),
      );
      expect(manifest.mainRepository).toEqual({
        url: "https://github.com/acme/alpha",
        localPath: alpha,
        status: "detected",
      });
      expect(manifest.linkedRepositories).toHaveLength(2);

      const back = yield* switchProjectMainRepository({
        project: {
          workspaceRoot: alpha,
          mainRepository: { ...switched.mainRepository!, selection: "user" },
        },
        url: null,
        selection: "user",
      });
      expect(back).toMatchObject({
        changed: true,
        workspaceRoot: home,
        mainRepository: { checkoutPath: home, projectRoot: home, selection: "user" },
      });
      expect(back.mainRepository?.url).toBeUndefined();
    }),
  );

  it.effect("never lets detection override an explicit user choice", () =>
    Effect.gen(function* () {
      const { home } = makeProject();
      const result = yield* switchProjectMainRepository({
        project: {
          workspaceRoot: home,
          mainRepository: { checkoutPath: home, projectRoot: home, selection: "user" },
        },
        url: "https://github.com/acme/alpha",
        selection: "detected",
      });
      expect(result.changed).toBe(false);
      expect(result.workspaceRoot).toBe(home);
    }),
  );

  it.effect("rejects a repository that has no ready local checkout", () =>
    Effect.gen(function* () {
      const { home } = makeProject();
      const error = yield* switchProjectMainRepository({
        project: { workspaceRoot: home },
        url: "https://github.com/acme/unknown",
        selection: "user",
      }).pipe(Effect.flip);
      expect(error.message).toContain("no ready local checkout");
    }),
  );

  it.effect("adopts a workspace repository only once it has a commit (flag on)", () =>
    Effect.gen(function* () {
      const root = makeTempRoot("t3-main-adopt-");
      initRepo(root, false);
      const adopted = { localPath: root, status: "adopted" };
      yield* withMainRepositoryFlag(undefined);
      expect(yield* detectMainRepository({ workspaceRoot: root })).toEqual(adopted);
      yield* withMainRepositoryFlag("1");
      expect(yield* detectMainRepository({ workspaceRoot: root })).toBeUndefined();
      initRepo(root, true);
      expect(yield* detectMainRepository({ workspaceRoot: root })).toEqual(adopted);
    }),
  );

  it.effect("ignores the machine-local state subpaths in a linked main checkout", () =>
    Effect.gen(function* () {
      const { home, alpha } = makeProject();
      yield* switchProjectMainRepository({
        project: { workspaceRoot: home },
        url: "https://github.com/acme/alpha",
        selection: "user",
      });
      const gitignore = NodeFS.readFileSync(NodePath.join(alpha, ".gitignore"), "utf8");
      for (const entry of MAIN_REPOSITORY_GITIGNORE_ENTRIES) expect(gitignore).toContain(entry);
      expect(gitignore.split(/\r?\n/)).not.toContain(GITIGNORE_ENTRY);
    }),
  );

  it("merges manifests: fresh results replace earlier entries, nothing is dropped", () => {
    const merged = mergeLinkedRepositoryEntries(
      [
        { url: "https://github.com/acme/alpha", localPath: "/a", status: "cloned" },
        { url: "https://github.com/acme/gone", localPath: "/g", status: "cloned" },
      ],
      [
        { url: "github.com/acme/alpha", localPath: "/a", status: "updated" },
        { url: "https://github.com/acme/new", localPath: "/n", status: "cloned" },
      ],
    );
    expect(merged.map((entry) => [entry.url, entry.status])).toEqual([
      ["github.com/acme/alpha", "updated"],
      ["https://github.com/acme/gone", "cloned"],
      ["https://github.com/acme/new", "cloned"],
    ]);
  });
});
