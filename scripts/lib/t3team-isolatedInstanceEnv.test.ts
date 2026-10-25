import { assert, describe, it } from "@effect/vitest";

import {
  isIsolatedInstanceBuild,
  assertIsolatedBuildSupported,
  isolatedBrandingFields,
  resolveAtlassianCallbackPorts,
  resolvePinnedBackendPort,
  t3codeProtocolClaims,
} from "./t3team-isolatedInstanceEnv.ts";

describe("resolvePinnedBackendPort", () => {
  it("is unpinned when nothing is set", () => {
    assert.isUndefined(resolvePinnedBackendPort({}));
    assert.isUndefined(resolvePinnedBackendPort({ VITE_DESKTOP_PIN_BACKEND_PORT: "0" }));
  });

  it("keeps VITE_DESKTOP_PIN_BACKEND_PORT=1 as an alias for the default port", () => {
    assert.equal(resolvePinnedBackendPort({ VITE_DESKTOP_PIN_BACKEND_PORT: "1" }), 3773);
  });

  it("pins the explicit port, which wins over the alias", () => {
    assert.equal(resolvePinnedBackendPort({ T3CODE_DESKTOP_BACKEND_PORT: "3774" }), 3774);
    assert.equal(
      resolvePinnedBackendPort({
        T3CODE_DESKTOP_BACKEND_PORT: "3775",
        VITE_DESKTOP_PIN_BACKEND_PORT: "1",
      }),
      3775,
    );
  });

  it("rejects ports that are not integers in 1024-65535", () => {
    for (const bad of ["80", "1023", "65536", "37.4", "abc", "-3774", "3774 3775"]) {
      assert.throws(
        () => resolvePinnedBackendPort({ T3CODE_DESKTOP_BACKEND_PORT: bad }),
        /T3CODE_DESKTOP_BACKEND_PORT must be an integer/u,
      );
    }
  });
});

describe("resolveAtlassianCallbackPorts", () => {
  it("is not checked in a build that pins no port", () => {
    assert.isUndefined(resolveAtlassianCallbackPorts({}));
  });

  it("defaults to the registered 3773 for a pinned build", () => {
    assert.deepEqual(
      resolveAtlassianCallbackPorts({ T3CODE_DESKTOP_BACKEND_PORT: "3774" }),
      [3773],
    );
    assert.deepEqual(resolveAtlassianCallbackPorts({ VITE_DESKTOP_PIN_BACKEND_PORT: "1" }), [3773]);
  });

  it("parses an explicit list and rejects a bad entry", () => {
    assert.deepEqual(
      resolveAtlassianCallbackPorts({ T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS: "3773, 3774" }),
      [3773, 3774],
    );
    assert.throws(
      () => resolveAtlassianCallbackPorts({ T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS: "3773,x" }),
      /T3CODE_DESKTOP_ATLASSIAN_CALLBACK_PORTS/u,
    );
  });
});

describe("isolated instance build output", () => {
  it("writes isolatedInstance into the branding and drops the t3code:// claim only when asked", () => {
    const on = { T3CODE_DESKTOP_ISOLATED_INSTANCE: "1" };
    assert.isTrue(isIsolatedInstanceBuild(on));
    assert.deepEqual(isolatedBrandingFields(on), { isolatedInstance: true });
    assert.deepEqual(t3codeProtocolClaims(on), []);

    for (const off of [{}, { T3CODE_DESKTOP_ISOLATED_INSTANCE: "0" }]) {
      assert.isFalse(isIsolatedInstanceBuild(off));
      assert.deepEqual(isolatedBrandingFields(off), {});
      assert.deepEqual(t3codeProtocolClaims(off), [
        { name: "T3 Code", schemes: ["t3code", "t3code-dev"] },
      ]);
    }
  });
});

describe("isolated instance build support", () => {
  const on = { T3CODE_DESKTOP_ISOLATED_INSTANCE: "1" };

  it("builds an isolated instance on macOS only", () => {
    assert.doesNotThrow(() => assertIsolatedBuildSupported(on, "mac", "Nexi Work Dog"));
    for (const platform of ["win", "linux"] as const) {
      assert.throws(
        () => assertIsolatedBuildSupported(on, platform, "Nexi Work Dog"),
        /isolated instances are macOS-only.*\b(win|linux)\b/su,
      );
    }
  });

  it("refuses an isolated build that has no product name to isolate by", () => {
    assert.throws(
      () => assertIsolatedBuildSupported(on, "mac", undefined),
      /needs a product name/u,
    );
  });

  it("leaves every other build alone", () => {
    for (const platform of ["mac", "win", "linux"] as const) {
      assert.doesNotThrow(() => assertIsolatedBuildSupported({}, platform, undefined));
      assert.doesNotThrow(() =>
        assertIsolatedBuildSupported({ T3CODE_DESKTOP_ISOLATED_INSTANCE: "0" }, platform, "X"),
      );
    }
  });
});
