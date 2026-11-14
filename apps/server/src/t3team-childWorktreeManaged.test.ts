import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig } from "./config.ts";
import * as ServerSettings from "./serverSettings.ts";
import { buildScopedChildWorktreePath } from "./t3team-toolBrokerStartChildLinkedRepository.ts";
import { makeIsManagedWorktreePath } from "./worktreesDirectory.ts";

const layer = Layer.mergeAll(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-child-managed-" }),
  ServerSettings.layerTest(),
).pipe(Layer.provideMerge(NodeServices.layer));

describe("child worktree paths", () => {
  it.effect("stay outside upstream's managed set, so a missing one is never recreated", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const { worktreesDir } = yield* ServerConfig;
      const isManaged = yield* makeIsManagedWorktreePath;
      const child = buildScopedChildWorktreePath({
        path,
        worktreesRoot: worktreesDir,
        repoFullName: "acme/linked",
        repoRef: "main",
        worktreeKey: "abcdef1234",
      });
      assert.isFalse(yield* isManaged(child));
      assert.isTrue(yield* isManaged(path.join(worktreesDir, "acme-linked", "main")));
    }).pipe(Effect.provideService(HostProcess.HomeDirectory, process.cwd()), Effect.provide(layer)),
  );
});
