// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  CLONE_ENV,
  SourceControlRepositoryService,
} from "./sourceControl/SourceControlRepositoryService.ts";
import { inspectRemoteProjectStateOnDefaultBranch } from "./t3team-linkedRemoteProjectStateInspect.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

describe("inspectRemoteProjectStateOnDefaultBranch", () => {
  /** A git stand-in whose `ls-tree <ref>:<dir>` answers only for the dirs in `trees`. */
  const inspect = (trees: Readonly<Record<string, string>>) => {
    const calls: Array<ReadonlyArray<string>> = [];
    const ok = (stdout: string, exitCode = 0) => ({
      exitCode: exitCode as never,
      stdout,
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
    });
    const vcs = Layer.succeed(VcsProcess, {
      run: (input) =>
        Effect.sync(() => {
          calls.push(input.args);
          if (input.args.includes("ls-tree")) {
            const dir = (input.args.at(-1) ?? "").split(":").slice(1).join(":");
            return dir in trees ? ok(trees[dir]!) : ok("", 128);
          }
          return ok("main");
        }),
    });
    const sourceControl = Layer.succeed(SourceControlRepositoryService, {
      prepareClone: () =>
        Effect.succeed({
          cloneUrl: "https://example.test/acme/repo.git",
          remoteUrl: "https://example.test/acme/repo.git",
          destinationPath: "/tmp/unused",
          repository: null,
        }),
    } as never);
    return Effect.gen(function* () {
      const result = yield* inspectRemoteProjectStateOnDefaultBranch(
        "https://example.test/acme/repo.git",
      );
      return { result, calls };
    }).pipe(Effect.provide(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)));
  };

  it.effect("reports committed .agents/nexi entries from ls-tree (committed-only)", () =>
    Effect.gen(function* () {
      const { result, calls } = yield* inspect({
        ".agents/nexi": "context/a.json\nmachine.json\n",
      });
      expect(result.hasProjectStateDir).toBe(true);
      expect(result.entryCount).toBe(2);
      expect(result.stateDirName).toBe(".agents/nexi");
      expect(result.committedOnly).toBe(true);
      expect(result.source).toBe("remote");
      expect(calls.some((args) => args.includes("ls-tree"))).toBe(true);
    }),
  );

  it.effect("a committed legacy .nexi still counts as project state", () =>
    Effect.gen(function* () {
      const { result } = yield* inspect({ ".nexi": "recipes/a/recipe.ts\nmachine.json\n" });
      expect(result.hasProjectStateDir).toBe(true);
      expect(result.entryCount).toBe(2);
      expect(result.stateDirName).toBe(".nexi");
    }),
  );

  it.effect("prefers the new dir when both are committed", () =>
    Effect.gen(function* () {
      const { result } = yield* inspect({
        ".agents/nexi": "machine.json\n",
        ".nexi": "recipes/a/recipe.ts\nmachine.json\n",
      });
      expect(result.stateDirName).toBe(".agents/nexi");
      expect(result.entryCount).toBe(1);
    }),
  );

  it.effect("a committed reference manifest alone is not project state", () => {
    const ok = (stdout: string) => ({
      exitCode: 0 as never,
      stdout,
      stderr: "",
      stdoutTruncated: false,
      stderrTruncated: false,
    });
    const vcs = Layer.succeed(VcsProcess, {
      run: (input) =>
        Effect.sync(() => {
          const op = input.args.join(" ");
          if (op.includes("fetch")) return ok("");
          // Every state dir name answers with machine-local bookkeeping only.
          if (op.includes("ls-tree")) {
            return ok("references/reference-repositories.json\nchild-session-worktrees/x/.keep\n");
          }
          return ok("main");
        }),
    });
    const sourceControl = Layer.succeed(SourceControlRepositoryService, {
      prepareClone: () =>
        Effect.succeed({
          cloneUrl: "https://example.test/acme/shared.git",
          remoteUrl: "https://example.test/acme/shared.git",
          destinationPath: "/tmp/unused",
          repository: null,
        }),
    } as never);
    return Effect.gen(function* () {
      const result = yield* inspectRemoteProjectStateOnDefaultBranch(
        "https://example.test/acme/shared.git",
      );
      expect(result.hasProjectStateDir).toBe(false);
      expect(result.entryCount).toBe(0);
    }).pipe(Effect.provide(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)));
  });

  /** A git stand-in: `failOn` exits 128, `hangOn` never returns; every call is recorded. */
  const scriptedGit = (options: { readonly failOn?: string; readonly hangOn?: string }) => {
    const calls: Array<{
      readonly cwd: string;
      readonly args: ReadonlyArray<string>;
      readonly env: unknown;
    }> = [];
    const layer = Layer.succeed(VcsProcess, {
      run: (input: {
        readonly cwd: string;
        readonly args: ReadonlyArray<string>;
        readonly env?: unknown;
      }) => {
        calls.push({ cwd: input.cwd, args: input.args, env: input.env });
        if (input.args[0] === options.hangOn) return Effect.never;
        return Effect.succeed({
          exitCode: (input.args[0] === options.failOn ? 128 : 0) as never,
          stdout: "",
          stderr: "",
          stdoutTruncated: false,
          stderrTruncated: false,
        });
      },
    } as never);
    return { calls, layer };
  };
  const passThroughClone = Layer.succeed(SourceControlRepositoryService, {
    prepareClone: (input: { remoteUrl: string }) => Effect.succeed({ cloneUrl: input.remoteUrl }),
  } as never);
  const scratchOf = (calls: ReadonlyArray<{ readonly cwd: string }>) => calls[0]!.cwd;

  const removesScratchWhenGitFails = (failOn: string) => {
    const git = scriptedGit({ failOn });
    return Effect.gen(function* () {
      // An unreadable remote fails (it is not "no project state"), and still cleans up.
      const error = yield* inspectRemoteProjectStateOnDefaultBranch(
        "https://example.test/a.git",
      ).pipe(Effect.flip);
      expect(error.message).toContain(`git ${failOn === "remote" ? "remote add" : "fetch"} failed`);
      expect(NodeFS.existsSync(scratchOf(git.calls))).toBe(false);
    }).pipe(Effect.provide(Layer.mergeAll(git.layer, passThroughClone, NodeServices.layer)));
  };

  it.effect("removes its temp folder when `git remote add` fails", () =>
    removesScratchWhenGitFails("remote"),
  );

  it.effect("removes its temp folder when `git fetch` fails", () =>
    removesScratchWhenGitFails("fetch"),
  );

  it.live("removes its temp folder when it is interrupted (a timeout) mid-fetch", () => {
    const git = scriptedGit({ hangOn: "fetch" });
    return Effect.gen(function* () {
      const outcome = yield* inspectRemoteProjectStateOnDefaultBranch(
        "https://example.test/a.git",
      ).pipe(Effect.timeout("50 millis"), Effect.flip);
      expect(outcome).toBeDefined();
      expect(git.calls.some((call) => call.args[0] === "fetch")).toBe(true);
      expect(NodeFS.existsSync(scratchOf(git.calls))).toBe(false);
    }).pipe(Effect.provide(Layer.mergeAll(git.layer, passThroughClone, NodeServices.layer)));
  });

  it.effect("authenticates exactly as a linked clone: its prepared URL and its env", () => {
    const git = scriptedGit({});
    return Effect.gen(function* () {
      // The URL is the clone's, unchanged: an embedded token and an ssh user both survive.
      for (const url of ["https://pj:token@example.test/a.git", "ssh://git@example.test/a.git"]) {
        git.calls.length = 0;
        yield* inspectRemoteProjectStateOnDefaultBranch(url);
        const remote = git.calls.find((call) => call.args[0] === "remote");
        const fetch = git.calls.find((call) => call.args[0] === "fetch");
        expect(remote?.args).toEqual(["remote", "add", "origin", url]);
        expect(remote?.env).toEqual(CLONE_ENV);
        expect(fetch?.env).toEqual(CLONE_ENV);
      }
    }).pipe(Effect.provide(Layer.mergeAll(git.layer, passThroughClone, NodeServices.layer)));
  });
});
