import { assert, describe, it } from "@effect/vitest";

import {
  buildWslRuntimeInstallScript,
  buildWslRuntimeInvalidateScript,
  buildWslRuntimePruneScript,
} from "./DesktopWslEnvironment.ts";
import {
  DEFAULT_WSL_RUNTIME_PARENT,
  wslRuntimeParentExpression,
} from "./t3team-wslRuntimeParent.ts";

describe("wslRuntimeParentExpression", () => {
  it("keeps the shared ~/.t3 cache for a non-isolated install", () => {
    assert.equal(wslRuntimeParentExpression("nexi-work", false), DEFAULT_WSL_RUNTIME_PARENT);
    assert.equal(wslRuntimeParentExpression(undefined, true), DEFAULT_WSL_RUNTIME_PARENT);
  });

  it("puts an isolated instance's runtime under a private home directory", () => {
    assert.equal(wslRuntimeParentExpression("nexi-work", true), "$HOME/.nexi-work/wsl-runtime");
    assert.equal(
      wslRuntimeParentExpression("nexi-work-nightly", true),
      "$HOME/.nexi-work-nightly/wsl-runtime",
    );
  });

  it("writes the isolated parent into the install, prune and invalidate scripts", () => {
    const parent = wslRuntimeParentExpression("nexi-work", true);
    const install = buildWslRuntimeInstallScript(
      "/runtime.tar.gz",
      "sha256-abc",
      "b".repeat(64),
      parent,
    );
    const prune = buildWslRuntimePruneScript("sha256-abc", parent);
    const invalidate = buildWslRuntimeInvalidateScript("sha256-abc", parent);
    assert.include(install, 'runtime_parent="$HOME/.nexi-work/wsl-runtime"');
    assert.notInclude(install, "$HOME/.t3/wsl-runtime");
    assert.include(prune, 'runtime_parent="$HOME/.nexi-work/wsl-runtime"');
    assert.include(invalidate, "$HOME/.nexi-work/wsl-runtime/sha256-abc");
    assert.notInclude(invalidate, "$HOME/.t3/wsl-runtime");
  });
});
