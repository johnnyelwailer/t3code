// @effect-diagnostics nodeBuiltinImport:off - temp git fixtures use node fs/child_process helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import { readTrackedStateFiles } from "./t3team-projectStateMigrationTracked.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

const TestLayer = Layer.mergeAll(
  VcsProcess.layer.pipe(Layer.provide(NodeServices.layer)),
  NodeServices.layer,
);

const tempRoots: string[] = [];
const makeRoot = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-tracked-state-"));
  tempRoots.push(root);
  return root;
};
afterAll(() => {
  for (const root of tempRoots) NodeFS.rmSync(root, { recursive: true, force: true });
});
const write = (file: string, contents: string) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
};
const git = (cwd: string, args: ReadonlyArray<string>) =>
  NodeChildProcess.execFileSync("git", [...args], { cwd, stdio: "pipe" });

it.layer(TestLayer)("readTrackedStateFiles", (it) => {
  it.effect("lists the state files a checkout commits, relative to the state dir", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "eval@test.com"]);
      git(root, ["config", "user.name", "Eval"]);
      write(NodePath.join(root, HIDDEN_T3TEAM_DIR, "recipes", "team", "recipe.md"), "team\n");
      write(NodePath.join(root, "README.md"), "# repo\n");
      git(root, ["add", "."]);
      git(root, ["commit", "-qm", "initial"]);
      // Untracked machine-local leftovers are not listed.
      write(NodePath.join(root, HIDDEN_T3TEAM_DIR, "context", "threads", "index.json"), "{}\n");

      const tracked = yield* readTrackedStateFiles(root);
      expect(tracked ? [...tracked] : tracked).toEqual(["recipes/team/recipe.md"]);
    }),
  );

  it.effect("a folder that is not a git checkout tracks nothing", () =>
    Effect.gen(function* () {
      const root = makeRoot();
      write(NodePath.join(root, HIDDEN_T3TEAM_DIR, "context", "entrypoint.json"), "{}\n");
      const tracked = yield* readTrackedStateFiles(root);
      expect(tracked ? [...tracked] : tracked).toEqual([]);
    }),
  );
});
