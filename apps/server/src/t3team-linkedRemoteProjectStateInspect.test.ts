// @effect-diagnostics nodeBuiltinImport:off
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import { inspectRemoteProjectStateOnDefaultBranch } from "./t3team-linkedRemoteProjectStateInspect.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";

describe("inspectRemoteProjectStateOnDefaultBranch", () => {
  it.effect("reports committed .nexi entries from ls-tree (committed-only)", () =>
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
    Effect.gen(function* () {
      const result = yield* inspectRemoteProjectStateOnDefaultBranch(
        "https://example.test/acme/repo.git",
      );
      expect(result.hasProjectStateDir).toBe(true);
      expect(result.entryCount).toBe(2);
      expect(result.committedOnly).toBe(true);
      expect(result.source).toBe("remote");
      expect(calls.some((args) => args.includes("ls-tree"))).toBe(true);
    }).pipe(Effect.provide(Layer.mergeAll(vcs, sourceControl, NodeServices.layer))),
  );

});
