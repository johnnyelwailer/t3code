// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import { inspectRemoteProjectStateOnDefaultBranch } from "./t3team-linkedRemoteProjectStateInspect.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

describe("inspectRemoteProjectStateOnDefaultBranch", () => {
  it.effect("reports committed .nexi entries from ls-tree (committed-only)", () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const vcs = Layer.succeed(VcsProcess, {
      run: (input) =>
        Effect.sync(() => {
          calls.push(input.args);
          const op = input.args.join(" ");
          if (op.includes("fetch")) {
            return {
              exitCode: 0 as never,
              stdout: "",
              stderr: "",
              stdoutTruncated: false,
              stderrTruncated: false,
            };
          }
          if (op.includes("ls-tree") && op.includes(".nexi")) {
            return {
              exitCode: 0 as never,
              stdout: ".nexi/context/a.json\n.nexi/machine.json\n",
              stderr: "",
              stdoutTruncated: false,
              stderrTruncated: false,
            };
          }
          return {
            exitCode: 0 as never,
            stdout: "main",
            stderr: "",
            stdoutTruncated: false,
            stderrTruncated: false,
          };
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
      expect(result.hasProjectStateDir).toBe(true);
      expect(result.entryCount).toBe(2);
      expect(result.committedOnly).toBe(true);
      expect(result.source).toBe("remote");
      expect(calls.some((args) => args.includes("ls-tree"))).toBe(true);
    }).pipe(Effect.provide(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)));
  });

  /** A git stand-in: `failOn` exits 128, `hangOn` never returns; every call is recorded. */
  const scriptedGit = (options: { readonly failOn?: string; readonly hangOn?: string }) => {
    const calls: Array<{ readonly cwd: string; readonly args: ReadonlyArray<string> }> = [];
    const layer = Layer.succeed(VcsProcess, {
      run: (input: { readonly cwd: string; readonly args: ReadonlyArray<string> }) => {
        calls.push({ cwd: input.cwd, args: input.args });
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
      const result = yield* inspectRemoteProjectStateOnDefaultBranch("https://example.test/a.git");
      expect(result.hasProjectStateDir).toBe(false);
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

  it.effect("never passes a credential in the URL to git", () => {
    const git = scriptedGit({});
    return Effect.gen(function* () {
      yield* inspectRemoteProjectStateOnDefaultBranch("https://pj:s3cret-token@example.test/a.git");
      const argv = git.calls.flatMap((call) => call.args).join(" ");
      expect(argv).not.toContain("s3cret-token");
      expect(argv).toContain("https://example.test/a.git");
    }).pipe(Effect.provide(Layer.mergeAll(git.layer, passThroughClone, NodeServices.layer)));
  });
});
