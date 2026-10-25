import { afterEach, describe, expect, it } from "@effect/vitest";
import { type AssetCreateUrlResult, EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import {
  assetUrlStateFromResult,
  createProjectFaviconUrlAtomFamily,
  resolveAssetUrl,
  setAssetUrlObserver,
} from "./assets.ts";

describe("project favicon URL cache", () => {
  it("does not reuse another environment, workspace, or selected icon's cached URL", () => {
    const registry = AtomRegistry.make();
    const result = Atom.make<AsyncResult.AsyncResult<AssetCreateUrlResult, unknown>>(
      AsyncResult.success({
        expiresAt: 4_000_000_000_000,
        relativeUrl: "/api/assets/token/icon.svg",
      }),
    );
    const favicon = createProjectFaviconUrlAtomFamily({
      createUrl: () => result,
      preparedConnection: () => Atom.make(Option.some({ httpBaseUrl: "https://remote.test" })),
    });
    const target = { environmentId: EnvironmentId.make("remote"), cwd: "/workspace" };
    const unmount = registry.mount(favicon(target));
    try {
      expect(registry.get(favicon(target))).toBe("https://remote.test/api/assets/token/icon.svg");
      registry.set(result, AsyncResult.failure(Cause.die("disconnected")));
      expect(
        registry.get(favicon({ ...target, environmentId: EnvironmentId.make("other") })),
      ).toBeNull();
      expect(registry.get(favicon({ ...target, cwd: "/other" }))).toBeNull();
      expect(registry.get(favicon({ ...target, faviconPath: "brand.svg" }))).toBeNull();
      expect(registry.get(favicon({ ...target, faviconPath: null }))).toBe(
        "https://remote.test/api/assets/token/icon.svg",
      );
    } finally {
      unmount();
      registry.dispose();
    }
  });
});

describe("asset URL observer (native HTTP clients cannot send the Android broker loopback cookie)", () => {
  afterEach(() => setAssetUrlObserver(null));

  it("sees every URL a platform hands to native consumers, however it was minted", () => {
    const seen: string[] = [];
    setAssetUrlObserver((url) => seen.push(url));
    expect(resolveAssetUrl("http://127.0.0.1:4100", "/api/assets/t/a.pdf")).toBe(
      "http://127.0.0.1:4100/api/assets/t/a.pdf",
    );
    const state = assetUrlStateFromResult(
      AsyncResult.success({ expiresAt: 4_000_000_000_000, relativeUrl: "/api/assets/t/b.png" }),
      "http://127.0.0.1:4100",
    );
    expect(state).toMatchObject({
      _tag: "Success",
      url: "http://127.0.0.1:4100/api/assets/t/b.png",
    });
    // An absolute URL minted for another local environment passes through unchanged and is seen too.
    resolveAssetUrl("http://127.0.0.1:4100", "http://127.0.0.1:4200/api/assets/t/c.mp4");
    expect(seen).toEqual([
      "http://127.0.0.1:4100/api/assets/t/a.pdf",
      "http://127.0.0.1:4100/api/assets/t/b.png",
      "http://127.0.0.1:4200/api/assets/t/c.mp4",
    ]);
  });

  it("sees project favicon URLs, which the composer chip loader fetches natively", () => {
    const seen: string[] = [];
    setAssetUrlObserver((url) => seen.push(url));
    const registry = AtomRegistry.make();
    const result = Atom.make<AsyncResult.AsyncResult<AssetCreateUrlResult, unknown>>(
      AsyncResult.success({ expiresAt: 4_000_000_000_000, relativeUrl: "/api/assets/t/icon.svg" }),
    );
    const favicon = createProjectFaviconUrlAtomFamily({
      createUrl: () => result,
      preparedConnection: () => Atom.make(Option.some({ httpBaseUrl: "http://127.0.0.1:4100" })),
    });
    const target = { environmentId: EnvironmentId.make("remote"), cwd: "/workspace" };
    const unmount = registry.mount(favicon(target));
    try {
      expect(registry.get(favicon(target))).toBe("http://127.0.0.1:4100/api/assets/t/icon.svg");
      expect(seen).toContain("http://127.0.0.1:4100/api/assets/t/icon.svg");
    } finally {
      unmount();
      registry.dispose();
    }
  });

  it("never fails URL resolution because the observer failed, and ignores invalid URLs", () => {
    const seen: string[] = [];
    setAssetUrlObserver((url) => {
      seen.push(url);
      throw new Error("native module unavailable");
    });
    expect(resolveAssetUrl("https://host.test", "/a")).toBe("https://host.test/a");
    expect(resolveAssetUrl("not a base", "/a")).toBeNull();
    expect(seen).toEqual(["https://host.test/a"]);
  });

  it("is a no-op by default", () => {
    expect(resolveAssetUrl("https://host.test", "/a")).toBe("https://host.test/a");
  });
});
