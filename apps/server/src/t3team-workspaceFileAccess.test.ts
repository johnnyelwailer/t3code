import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { createWorkspaceFileAccess } from "./t3team-workspaceFileAccess.ts";

const makeAccess = Effect.fn("makeAccess")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-access-" });
  return {
    root,
    fileSystem,
    pathService,
    access: createWorkspaceFileAccess({ fileSystem, pathService, rootPath: root }),
  };
});

it.layer(NodeServices.layer)("workspace file access and the state dir", (it) => {
  describe("writable paths", () => {
    it.effect("writes under .agents/nexi and the legacy .nexi", () =>
      Effect.gen(function* () {
        const { access, root, fileSystem, pathService } = yield* makeAccess();
        yield* Effect.promise(() => access.writeText(".agents/nexi/machine.json", "{}"));
        yield* Effect.promise(() => access.writeText(".nexi/machine.json", "{}"));
        expect(yield* fileSystem.exists(pathService.join(root, ".agents/nexi/machine.json"))).toBe(
          true,
        );
        expect(yield* Effect.promise(() => access.exists(".nexi/machine.json"))).toBe(true);
      }),
    );

    it.effect("still refuses the reserved top-level entries, even through .agents", () =>
      Effect.gen(function* () {
        const { access } = yield* makeAccess();
        for (const path of [
          ".git/config",
          ".t3/state",
          ".agents/../.git/config",
          ".t3team-runs/x",
        ]) {
          const outcome = yield* Effect.promise(() =>
            access.writeText(path, "x").then(
              () => "written",
              (error: Error) => error.message,
            ),
          );
          expect(outcome).toContain("cannot access");
        }
      }),
    );

    it.effect("refuses a write through a symlinked .agents that points out of the root", () =>
      Effect.gen(function* () {
        const { access, root, fileSystem, pathService } = yield* makeAccess();
        const outside = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3team-ws-out-" });
        yield* fileSystem.symlink(outside, pathService.join(root, ".agents"));
        const outcome = yield* Effect.promise(() =>
          access.writeText(".agents/nexi/machine.json", "{}").then(
            () => "written",
            (error: Error) => error.message,
          ),
        );
        expect(outcome).not.toBe("written");
        expect(yield* fileSystem.exists(pathService.join(outside, "nexi"))).toBe(false);
      }),
    );
  });
});
