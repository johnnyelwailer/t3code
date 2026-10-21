// @effect-diagnostics nodeBuiltinImport:off - temp git fixtures use node fs/child_process helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterAll, assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { readHandoffHasOrigin } from "./t3team-threadHandoffBranchState.ts";
import * as VcsProcess from "./vcs/VcsProcess.ts";

const root = NodeFS.mkdtempSync(
  NodePath.join(NodeFS.realpathSync(NodeOS.tmpdir()), "handoff-origin-"),
);
// Hermetic git: no system config, a global config of our own, never a repository above `root`.
const gitEnv = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NodePath.join(root, "global.gitconfig"),
  GIT_CEILING_DIRECTORIES: root,
};
const previousEnv = Object.fromEntries(Object.keys(gitEnv).map((key) => [key, process.env[key]]));
Object.assign(process.env, gitEnv);
NodeFS.writeFileSync(gitEnv.GIT_CONFIG_GLOBAL, "");
afterAll(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  NodeFS.rmSync(root, { recursive: true, force: true });
});

const folder = (name: string) => {
  const path = NodePath.join(root, name);
  NodeFS.mkdirSync(path);
  return path;
};

const repo = (name: string, ...remotes: ReadonlyArray<readonly [string, string]>) => {
  const path = folder(name);
  NodeChildProcess.execFileSync("git", ["init", "--quiet"], { cwd: path });
  for (const [remote, url] of remotes) {
    NodeChildProcess.execFileSync("git", ["remote", "add", remote, url], { cwd: path });
  }
  return path;
};

const hasOrigin = (cwd: string) =>
  Effect.flatMap(VcsProcess.VcsProcess, (vcs) => readHandoffHasOrigin(vcs, cwd)).pipe(
    Effect.provide(VcsProcess.layer.pipe(Layer.provide(NodeServices.layer))),
  );

describe("readHandoffHasOrigin on real git", () => {
  it.effect("reads the repository's own remotes only", () =>
    Effect.gen(function* () {
      assert.isTrue(yield* hasOrigin(repo("with-origin", ["origin", "https://example.com/a.git"])));
      assert.isFalse(yield* hasOrigin(repo("no-remotes")));
      assert.isFalse(
        yield* hasOrigin(repo("upstream-only", ["upstream", "https://example.com/u.git"])),
      );
      // Not a repository: git can't say, so the move is refused as unverified.
      assert.isNull(yield* hasOrigin(folder("plain")));
      // An origin in the user's global config is not this project's remote.
      NodeFS.writeFileSync(
        gitEnv.GIT_CONFIG_GLOBAL,
        '[remote "origin"]\n\turl = https://example.com/global.git\n',
      );
      assert.isFalse(yield* hasOrigin(repo("global-origin-only")));
      assert.isNull(yield* hasOrigin(folder("plain-global-origin")));
    }),
  );
});
