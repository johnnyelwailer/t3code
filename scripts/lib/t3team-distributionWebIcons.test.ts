import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { applyDistributionWebIcons } from "./t3team-distributionWebIcons.ts";

it.layer(NodeServices.layer)("applyDistributionWebIcons", (it) => {
  const setup = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3team-web-icons-" });
    const client = path.join(root, "dist/client");
    yield* fs.makeDirectory(client, { recursive: true });
    for (const name of [
      "apple-touch-icon.png",
      "favicon-16x16.png",
      "favicon-32x32.png",
      "favicon.ico",
    ]) {
      yield* fs.writeFileString(path.join(client, name), "t3");
    }
    yield* fs.writeFileString(path.join(root, "pack.png"), "pack-png");
    yield* fs.writeFileString(path.join(root, "pack.ico"), "pack-ico");
    return { fs, path, root, client };
  });

  it.effect("stamps the pack icon over the splash and favicon icons", () =>
    Effect.gen(function* () {
      const { fs, path, root, client } = yield* setup;
      const replaced = yield* applyDistributionWebIcons({
        repoRoot: root,
        targetDirectory: "dist/client",
        iconPng: path.join(root, "pack.png"),
        iconIco: path.join(root, "pack.ico"),
      });
      assert.equal(replaced, 4);
      assert.equal(yield* fs.readFileString(path.join(client, "apple-touch-icon.png")), "pack-png");
      assert.equal(yield* fs.readFileString(path.join(client, "favicon-32x32.png")), "pack-png");
      assert.equal(yield* fs.readFileString(path.join(client, "favicon.ico")), "pack-ico");
    }).pipe(Effect.scoped),
  );

  it.effect("leaves T3's icons alone when the build has no distribution icon", () =>
    Effect.gen(function* () {
      const { fs, path, root, client } = yield* setup;
      const replaced = yield* applyDistributionWebIcons({
        repoRoot: root,
        targetDirectory: "dist/client",
        iconPng: undefined,
        iconIco: undefined,
      });
      assert.equal(replaced, 0);
      assert.equal(yield* fs.readFileString(path.join(client, "apple-touch-icon.png")), "t3");
    }).pipe(Effect.scoped),
  );
});
