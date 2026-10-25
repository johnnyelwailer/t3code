// @effect-diagnostics nodeBuiltinImport:off - joins paths with the posix helper to pin macOS-shaped results.
import { assert, describe, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as NodePath from "node:path";

import {
  pinnedBackendPortFromDefine,
  resolveEffectiveT3Home,
  resolveIsolatedHome,
  resolveIsolatedProfileDir,
} from "./t3team-isolatedInstance.ts";

describe("isolated instance paths", () => {
  it("owns one directory under app data, with its Electron profile inside it", () => {
    const home = resolveIsolatedHome({
      appDataDirectory: "/Users/alice/Library/Application Support",
      userDataDirName: "nexi-work-nightly-dogfood",
      join: NodePath.posix.join,
    });
    assert.equal(home, "/Users/alice/Library/Application Support/nexi-work-nightly-dogfood");
    assert.equal(
      resolveIsolatedProfileDir(home, NodePath.posix.join),
      "/Users/alice/Library/Application Support/nexi-work-nightly-dogfood/electron-profile",
    );
  });

  it("keeps an explicit T3CODE_HOME ahead of the isolated home", () => {
    assert.deepEqual(
      resolveEffectiveT3Home({ configured: Option.some("/ops/home"), isolatedHome: "/iso" }),
      Option.some("/ops/home"),
    );
    assert.deepEqual(
      resolveEffectiveT3Home({ configured: Option.none(), isolatedHome: "/iso" }),
      Option.some("/iso"),
    );
    assert.deepEqual(
      resolveEffectiveT3Home({ configured: Option.some("  "), isolatedHome: "/iso" }),
      Option.some("/iso"),
    );
    assert.deepEqual(
      resolveEffectiveT3Home({ configured: Option.none(), isolatedHome: undefined }),
      Option.none(),
    );
  });
});

describe("pinnedBackendPortFromDefine", () => {
  it("reads the legacy boolean as the default port and a number as that port", () => {
    assert.equal(pinnedBackendPortFromDefine(true), 3773);
    assert.equal(pinnedBackendPortFromDefine(3774), 3774);
  });

  it("treats everything else as unpinned", () => {
    for (const value of [false, undefined, null, "3774", 80, 70_000, 3774.5, Number.NaN]) {
      assert.isUndefined(pinnedBackendPortFromDefine(value));
    }
  });
});
