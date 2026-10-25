import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const hook = NodeModule.createRequire(import.meta.url)("./t3team-distributionMobileMetro.cjs") as {
  API_SPECIFIER: string;
  SPECIFIER: string;
  assertOverlayBundled: (
    graph: { dependencies: Map<string, unknown> },
    selection: { entryPath: string },
    appRoot: string,
  ) => void;
  cssEntryFile: (
    original: string,
    input: { appRoot: string; env: Record<string, string> },
  ) => string;
  readDistributionMobile: (input: {
    appRoot: string;
    env: Record<string, string | undefined>;
  }) => { packDir: string; entryPath: string } | null;
  withDistributionMobile: (
    config: any,
    input: { appRoot: string; env: Record<string, string> },
  ) => any;
};

let root: string;
let appRoot: string;
let packDir: string;
const real = (path: string) => NodeFS.realpathSync.native(path);
const write = (path: string, text: string) => {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, text);
};

beforeEach(() => {
  root = real(NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "distribution-mobile-")));
  appRoot = NodePath.join(root, "workspace", "apps", "mobile");
  packDir = NodePath.join(root, "distro", "pack");
  write(NodePath.join(appRoot, "package.json"), JSON.stringify({ dependencies: { react: "1" } }));
  write(
    NodePath.join(packDir, "mobile.json"),
    JSON.stringify({ overlay: { entry: "mobile/index.tsx" } }),
  );
  write(NodePath.join(packDir, "mobile", "index.tsx"), "export default {};");
});
afterEach(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const baseConfig = () => ({
  watchFolders: [],
  resolver: {},
  serializer: { customSerializer: () => "serialized" },
});
const selected = (dir = packDir) => ({ T3CODE_DISTRIBUTION: dir });
const resolveWith = (env: Record<string, string>) => {
  const seen: Array<{ origin: string; name: string }> = [];
  const config = baseConfig();
  config.resolver = {
    resolveRequest: (context: { originModulePath: string }, name: string) => {
      seen.push({ origin: context.originModulePath, name });
      return { type: "sourceFile", filePath: NodePath.join(packDir, "mobile", "inner.ts") };
    },
  } as never;
  const wrapped = hook.withDistributionMobile(config, { appRoot, env });
  const resolve = (origin: string, name: string) =>
    wrapped.resolver.resolveRequest({ originModulePath: origin }, name, "android");
  return { wrapped, resolve, seen };
};

describe("a build without a selected overlay is the stock app", () => {
  it("steps aside without T3CODE_DISTRIBUTION, without mobile.json, or without an overlay field", () => {
    expect(hook.readDistributionMobile({ appRoot, env: {} })).toBeNull();
    NodeFS.rmSync(NodePath.join(packDir, "mobile.json"));
    expect(hook.readDistributionMobile({ appRoot, env: selected() })).toBeNull();
    write(NodePath.join(packDir, "mobile.json"), JSON.stringify({ platform: "mobile" }));
    expect(hook.readDistributionMobile({ appRoot, env: selected() })).toBeNull();
    const config = baseConfig();
    expect(hook.withDistributionMobile(config, { appRoot, env: {} })).toBe(config);
    expect(hook.cssEntryFile("./global.css", { appRoot, env: {} })).toBe("./global.css");
  });
});

describe("reading the declared overlay", () => {
  it("returns canonical paths, also through a symlinked checkout", () => {
    const link = NodePath.join(root, "link");
    NodeFS.symlinkSync(NodePath.join(root, "distro"), link);
    const selection = hook.readDistributionMobile({
      appRoot,
      env: selected(NodePath.join(link, "pack")),
    });
    expect(selection).toEqual({
      packDir,
      entryPath: NodePath.join(packDir, "mobile", "index.tsx"),
    });
  });

  it("fails the build for an entry outside the pack, a missing entry or a malformed field", () => {
    for (const overlay of [
      { entry: "../elsewhere.ts" },
      { entry: "mobile/missing.tsx" },
      {},
      "x",
    ]) {
      write(NodePath.join(packDir, "mobile.json"), JSON.stringify({ overlay }));
      expect(() => hook.readDistributionMobile({ appRoot, env: selected() })).toThrow(
        /distribution-mobile/,
      );
    }
  });
});

describe("resolution of overlay files", () => {
  it("sends the distribution specifier to the entry and the API specifier to the app module", () => {
    const { resolve } = resolveWith(selected());
    expect(resolve(NodePath.join(appRoot, "src", "x.ts"), hook.SPECIFIER)).toEqual({
      type: "sourceFile",
      filePath: NodePath.join(packDir, "mobile", "index.tsx"),
    });
    expect(resolve(NodePath.join(packDir, "mobile", "index.tsx"), hook.API_SPECIFIER)).toEqual({
      type: "sourceFile",
      filePath: NodePath.join(real(appRoot), "src", "extensions", "t3team-api.ts"),
    });
  });

  it("resolves an allowed bare import as if the app wrote it", () => {
    const { resolve, seen } = resolveWith(selected());
    resolve(NodePath.join(packDir, "mobile", "index.tsx"), "react");
    expect(seen[0]?.origin).toBe(NodePath.join(real(appRoot), "package.json"));
  });

  it("fails the build for imports that are not app dependencies, even deep app imports", () => {
    const { resolve } = resolveWith(selected());
    const origin = NodePath.join(packDir, "mobile", "index.tsx");
    expect(() => resolve(origin, "left-pad")).toThrow(/neither a dependency/);
    expect(() => resolve(origin, "@t3tools/mobile-app/lib/time")).toThrow(/neither a dependency/);
  });

  it("fails the build for a relative import that leaves the pack", () => {
    const config = baseConfig();
    config.resolver = {
      resolveRequest: () => ({ type: "sourceFile", filePath: NodePath.join(root, "outside.ts") }),
    } as never;
    const wrapped = hook.withDistributionMobile(config, { appRoot, env: selected() });
    expect(() =>
      wrapped.resolver.resolveRequest(
        { originModulePath: NodePath.join(packDir, "mobile", "index.tsx") },
        "../../../outside",
        "android",
      ),
    ).toThrow(/outside the pack/);
  });

  it("lets the app's own files resolve normally", () => {
    const { resolve, seen } = resolveWith(selected());
    resolve(NodePath.join(appRoot, "src", "App.tsx"), "left-pad");
    expect(seen[0]?.origin).toBe(NodePath.join(appRoot, "src", "App.tsx"));
  });
});

describe("the bundle check fails closed", () => {
  const registry = () => NodePath.join(real(appRoot), "src", "extensions", "t3team-extensions.ts");
  const entryPath = () => NodePath.join(packDir, "mobile", "index.tsx");

  it("refuses a bundle with the registry but without the selected overlay", () => {
    const graph = { dependencies: new Map([[registry(), {}]]) };
    expect(() =>
      hook.assertOverlayBundled(graph, { entryPath: entryPath() }, real(appRoot)),
    ).toThrow(/ship without its overlay/);
  });

  it("refuses a bundle that still contains the stock stub", () => {
    const stub = NodePath.join(real(appRoot), "src", "t3team-distributionMobile.ts");
    const graph = {
      dependencies: new Map([
        [registry(), {}],
        [entryPath(), {}],
        [stub, {}],
      ]),
    };
    expect(() =>
      hook.assertOverlayBundled(graph, { entryPath: entryPath() }, real(appRoot)),
    ).toThrow();
  });

  it("accepts a bundle with the overlay, and chunks without the registry", () => {
    const full = {
      dependencies: new Map([
        [registry(), {}],
        [entryPath(), {}],
      ]),
    };
    expect(() =>
      hook.assertOverlayBundled(full, { entryPath: entryPath() }, real(appRoot)),
    ).not.toThrow();
    const chunk = { dependencies: new Map() };
    expect(() =>
      hook.assertOverlayBundled(chunk, { entryPath: entryPath() }, real(appRoot)),
    ).not.toThrow();
  });

  it("is wired into the serializer", () => {
    const { wrapped } = resolveWith(selected());
    const graph = { dependencies: new Map([[registry(), {}]]) };
    expect(() => wrapped.serializer.customSerializer("entry", [], graph, {})).toThrow(/overlay/);
    const ok = {
      dependencies: new Map([
        [registry(), {}],
        [entryPath(), {}],
      ]),
    };
    expect(wrapped.serializer.customSerializer("entry", [], ok, {})).toBe("serialized");
  });
});
