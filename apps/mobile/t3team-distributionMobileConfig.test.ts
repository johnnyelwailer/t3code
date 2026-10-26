import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const config = NodeModule.createRequire(import.meta.url)(
  "./t3team-distributionMobileConfig.cjs",
) as {
  applyDistributionMobile: (
    expoConfig: { updates?: Record<string, unknown>; plugins?: unknown[] },
    env: Record<string, string | undefined>,
  ) => { updates?: Record<string, unknown>; plugins?: unknown[] };
  fingerprintSources: (
    env: Record<string, string | undefined>,
  ) => Array<{ id: string; contents: string }>;
};

let root: string;
let packDir: string;
const write = (path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, text);
};
const selected = () => ({ T3CODE_DISTRIBUTION: packDir });

beforeEach(() => {
  root = NodeFS.realpathSync.native(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distribution-config-")),
  );
  packDir = NodePath.join(root, "pack");
  write(NodePath.join(packDir, "distribution.json"), "{}");
  write(
    NodePath.join(packDir, "mobile.json"),
    JSON.stringify({ overlay: { entry: "mobile/index.tsx" } }),
  );
  write(NodePath.join(packDir, "mobile", "index.tsx"), "export default {};");
});
afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

describe("the app config of a build with a selected overlay", () => {
  it("is returned untouched for a stock build", () => {
    const expo = { updates: { enabled: true }, plugins: ["a"] };
    expect(config.applyDistributionMobile(expo, {})).toBe(expo);
    expect(config.fingerprintSources({})).toEqual([]);
  });

  it("turns Expo updates off, whatever T3CODE_MOBILE_UPDATES_ENABLED says", () => {
    const expo = { updates: { enabled: true, url: "https://u.expo.dev/x" }, plugins: ["a"] };
    const applied = config.applyDistributionMobile(expo, {
      ...selected(),
      T3CODE_MOBILE_UPDATES_ENABLED: "1",
    });
    expect(applied.updates).toEqual({ enabled: false, url: "https://u.expo.dev/x" });
  });

  it("adds the Gradle plugin that makes the overlay an input of the bundle task", () => {
    const applied = config.applyDistributionMobile({ plugins: ["a"] }, selected());
    expect(applied.plugins?.[0]).toBe("a");
    expect(JSON.stringify(applied.plugins?.[1])).toContain(
      "t3team-withDistributionMobileGradle.cjs",
    );
  });
});

describe("the runtime version of a build with a selected overlay", () => {
  const source = () =>
    config.fingerprintSources(selected()).find((entry) => entry.id === "distributionMobile");

  it("changes with the overlay's files, so a Nexi binary never shares a runtime with a stock one", () => {
    const before = source();
    expect(before).toBeDefined();
    write(NodePath.join(packDir, "mobile", "index.tsx"), "export default { changed: true };");
    expect(source()?.contents).not.toBe(before?.contents);
  });

  it("does not change with files outside the overlay", () => {
    const before = source()?.contents;
    write(NodePath.join(packDir, "web", "other.ts"), "x");
    expect(source()?.contents).toBe(before);
  });

  it("ignores build outputs inside the overlay (a native module builds under its own build directory)", () => {
    const before = source()?.contents;
    write(NodePath.join(packDir, "mobile", "modules", "m", "android", "build", "out.class"), "x");
    expect(source()?.contents).toBe(before);
  });

  it("includes the assets the overlay declares, and only its declared directories", () => {
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({ overlay: { entry: "mobile/index.tsx", assets: "assets" } }),
    );
    write(NodePath.join(packDir, "assets", "font.ttf"), "v1");
    const before = source()?.contents;
    write(NodePath.join(packDir, "assets", "font.ttf"), "v2");
    expect(source()?.contents).not.toBe(before);
  });

  it("includes the source of a declared package, and not its tests", () => {
    const dir = NodePath.join(root, "shared", "dispatch");
    write(
      NodePath.join(dir, "package.json"),
      JSON.stringify({ name: "@nexi/dispatch", main: "src/index.ts" }),
    );
    write(NodePath.join(dir, "src", "index.ts"), "v1");
    write(NodePath.join(dir, "test", "a.test.ts"), "t1");
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({
        overlay: {
          entry: "mobile/index.tsx",
          packages: { "@nexi/dispatch": "../shared/dispatch" },
        },
      }),
    );
    const before = source()?.contents;
    write(NodePath.join(dir, "test", "a.test.ts"), "t2");
    expect(source()?.contents).toBe(before);
    write(NodePath.join(dir, "src", "index.ts"), "v2");
    expect(source()?.contents).not.toBe(before);
  });

  it("follows a change of a declared package's main, though no source file changes", () => {
    const dir = NodePath.join(root, "shared", "dispatch");
    write(NodePath.join(dir, "src", "a.ts"), "same");
    write(NodePath.join(dir, "src", "b.ts"), "same");
    const manifest = (main: string) =>
      write(NodePath.join(dir, "package.json"), JSON.stringify({ name: "@nexi/dispatch", main }));
    manifest("src/a.ts");
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({
        overlay: {
          entry: "mobile/index.tsx",
          packages: { "@nexi/dispatch": "../shared/dispatch" },
        },
      }),
    );
    const before = source()?.contents;
    manifest("src/b.ts");
    expect(source()?.contents).not.toBe(before);
  });

  it("includes the native modules the overlay declares", () => {
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({ overlay: { entry: "mobile/index.tsx", nativeModules: "native" } }),
    );
    write(NodePath.join(packDir, "native", "A.kt"), "class A");
    const before = source()?.contents;
    write(NodePath.join(packDir, "native", "A.kt"), "class B");
    expect(source()?.contents).not.toBe(before);
  });
});
