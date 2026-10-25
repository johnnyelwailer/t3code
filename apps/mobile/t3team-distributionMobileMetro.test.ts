import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

const hook = NodeModule.createRequire(import.meta.url)("./t3team-distributionMobileMetro.cjs") as {
  API_SPECIFIER: string;
  OVERLAY_PACKAGES: ReadonlySet<string>;
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
  write(NodePath.join(packDir, "distribution.json"), "{}");
  write(
    NodePath.join(appRoot, "package.json"),
    JSON.stringify({ dependencies: { react: "1", "left-pad": "1" } }),
  );
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
  it("steps aside without T3CODE_DISTRIBUTION or when mobile.json declares no overlay", () => {
    expect(hook.readDistributionMobile({ appRoot, env: {} })).toBeNull();
    expect(hook.readDistributionMobile({ appRoot, env: { T3CODE_DISTRIBUTION: "  " } })).toBeNull();
    write(NodePath.join(packDir, "mobile.json"), JSON.stringify({ platform: "mobile" }));
    expect(hook.readDistributionMobile({ appRoot, env: selected() })).toBeNull();
    const config = baseConfig();
    expect(hook.withDistributionMobile(config, { appRoot, env: {} })).toBe(config);
    expect(hook.cssEntryFile("./global.css", { appRoot, env: {} })).toBe("./global.css");
  });

  it("fails the build when T3CODE_DISTRIBUTION is set but names no usable distribution", () => {
    const problems = [
      NodePath.join(root, "missing"), // no such directory
      NodePath.join(root, "distro"), // a directory without distribution.json
    ];
    for (const dir of problems) {
      expect(() => hook.readDistributionMobile({ appRoot, env: selected(dir) })).toThrow(
        /distribution-mobile/,
      );
    }
    NodeFS.rmSync(NodePath.join(packDir, "mobile.json"));
    expect(() => hook.readDistributionMobile({ appRoot, env: selected() })).toThrow(/mobile\.json/);
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
      nativeModulesDir: null,
      assetsDir: null,
      packages: [],
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

describe("packages the overlay declares outside its pack", () => {
  /** A shared source package next to the pack, as nx-nexi's shared/packages/cloud-dispatch is. */
  const declarePackage = (main = "src/index.ts") => {
    const dir = NodePath.join(root, "distro", "shared", "dispatch");
    write(NodePath.join(dir, "package.json"), JSON.stringify({ name: "@nexi/dispatch", main }));
    write(NodePath.join(dir, "src", "index.ts"), "export const x = 1;");
    write(NodePath.join(dir, "test", "x.test.ts"), "x");
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({
        overlay: {
          entry: "mobile/index.tsx",
          packages: { "@nexi/dispatch": "../shared/dispatch" },
        },
      }),
    );
    return dir;
  };

  it("resolves only the declared name, to the package's main file", () => {
    const dir = declarePackage();
    const { resolve } = resolveWith(selected());
    expect(resolve(NodePath.join(packDir, "mobile", "index.tsx"), "@nexi/dispatch")).toEqual({
      type: "sourceFile",
      filePath: NodePath.join(real(dir), "src", "index.ts"),
    });
    expect(() =>
      resolve(NodePath.join(packDir, "mobile", "index.tsx"), "@nexi/dispatch/src/x"),
    ).toThrow(/not on the overlay's list/);
    expect(() => resolve(NodePath.join(packDir, "mobile", "index.tsx"), "@nexi/other")).toThrow(
      /not on the overlay's list/,
    );
  });

  it("holds the package's own files to the overlay's rules", () => {
    const dir = declarePackage();
    const { resolve } = resolveWith(selected());
    const origin = NodePath.join(dir, "src", "index.ts");
    expect(() => resolve(origin, "left-pad")).toThrow(/not on the overlay's list/);
    const config = baseConfig();
    config.resolver = {
      resolveRequest: () => ({ type: "sourceFile", filePath: NodePath.join(root, "elsewhere.ts") }),
    } as never;
    const wrapped = hook.withDistributionMobile(config, { appRoot, env: selected() });
    expect(() =>
      wrapped.resolver.resolveRequest(
        { originModulePath: origin },
        "../../../elsewhere",
        "android",
      ),
    ).toThrow(/outside the overlay's directories/);
  });

  it("tracks the package's source directory (not its tests) and watches the package", () => {
    const dir = declarePackage();
    const hookRequire = NodeModule.createRequire(import.meta.url);
    const { trackedRoots } = hookRequire("./t3team-distributionMobileSelection.cjs") as {
      trackedRoots: (selection: unknown) => string[];
    };
    const selection = hook.readDistributionMobile({ appRoot, env: selected() });
    expect(trackedRoots(selection)).toContain(NodePath.join(real(dir), "src"));
    expect(trackedRoots(selection)).not.toContain(real(dir));
    const wrapped = hook.withDistributionMobile(baseConfig(), { appRoot, env: selected() });
    expect(wrapped.watchFolders).toContain(real(dir));
  });

  it("fails the build for a package that is not what mobile.json says it is", () => {
    for (const bad of [
      { "@nexi/dispatch": "../missing" },
      { react: "../shared/dispatch" },
      { "@t3code/mobile-api": "../shared/dispatch" },
      { "@nexi/renamed": "../shared/dispatch" },
      "x",
    ]) {
      declarePackage();
      write(
        NodePath.join(packDir, "mobile.json"),
        JSON.stringify({ overlay: { entry: "mobile/index.tsx", packages: bad } }),
      );
      expect(() => hook.readDistributionMobile({ appRoot, env: selected() })).toThrow(
        /distribution-mobile/,
      );
    }
    declarePackage("../../outside.ts");
    expect(() => hook.readDistributionMobile({ appRoot, env: selected() })).toThrow(
      /inside the package/,
    );
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

  it("allows the helpers the transform injects into any file", () => {
    const { resolve, seen } = resolveWith(selected());
    resolve(
      NodePath.join(packDir, "mobile", "index.tsx"),
      "@babel/runtime/helpers/asyncToGenerator",
    );
    expect(seen[0]?.origin).toBe(NodePath.join(real(appRoot), "package.json"));
  });

  it("fails the build for imports outside the stated list, even app dependencies and deep app imports", () => {
    const { resolve } = resolveWith(selected());
    const origin = NodePath.join(packDir, "mobile", "index.tsx");
    // left-pad is a direct dependency of this fake app, but not on the overlay's list.
    expect(() => resolve(origin, "left-pad")).toThrow(/not on the overlay's list/);
    expect(() => resolve(origin, "@t3tools/mobile-app/lib/time")).toThrow(
      /not on the overlay's list/,
    );
    expect(() => resolve(origin, "@t3tools/provider-core")).toThrow(/not on the overlay's list/);
  });

  it("lists every package the overlay may use, with no wildcard", () => {
    expect([...hook.OVERLAY_PACKAGES].sort()).toEqual(
      [
        "@react-navigation/native",
        "@t3tools/client-runtime",
        "@t3tools/contracts",
        "@t3tools/shared",
        "effect",
        "expo",
        "expo-clipboard",
        "expo-constants",
        "expo-font",
        "expo-image",
        "expo-network",
        "expo-secure-store",
        "react",
        "react-native",
        "react-native-reanimated",
        "react-native-safe-area-context",
      ].sort(),
    );
  });

  it("keeps asset resolutions inside the pack too", () => {
    const config = baseConfig();
    config.resolver = {
      resolveRequest: () => ({
        type: "assetFiles",
        filePaths: [NodePath.join(root, "outside.png")],
      }),
    } as never;
    const wrapped = hook.withDistributionMobile(config, { appRoot, env: selected() });
    expect(() =>
      wrapped.resolver.resolveRequest(
        { originModulePath: NodePath.join(packDir, "mobile", "index.tsx") },
        "../../../outside.png",
        "android",
      ),
    ).toThrow(/outside the overlay's directories/);
  });

  it("fails the build for a relative import into a pack directory the overlay does not declare", () => {
    // The overlay's code, native modules and assets are tracked (runtime version, Gradle inputs):
    // a sibling directory of the pack is not, so a change there could ship a stale bundle.
    const config = baseConfig();
    config.resolver = {
      resolveRequest: () => ({
        type: "sourceFile",
        filePath: NodePath.join(packDir, "web", "x.ts"),
      }),
    } as never;
    const wrapped = hook.withDistributionMobile(config, { appRoot, env: selected() });
    expect(() =>
      wrapped.resolver.resolveRequest(
        { originModulePath: NodePath.join(packDir, "mobile", "index.tsx") },
        "../web/x",
        "android",
      ),
    ).toThrow(/outside the overlay's directories/);
  });

  it("lets an overlay import from its declared assets directory", () => {
    write(
      NodePath.join(packDir, "mobile.json"),
      JSON.stringify({ overlay: { entry: "mobile/index.tsx", assets: "assets" } }),
    );
    write(NodePath.join(packDir, "assets", "font.ttf"), "x");
    const config = baseConfig();
    config.resolver = {
      resolveRequest: () => ({
        type: "assetFiles",
        filePaths: [NodePath.join(packDir, "assets", "font.ttf")],
      }),
    } as never;
    const wrapped = hook.withDistributionMobile(config, { appRoot, env: selected() });
    expect(
      wrapped.resolver.resolveRequest(
        { originModulePath: NodePath.join(packDir, "mobile", "index.tsx") },
        "../assets/font.ttf",
        "android",
      ),
    ).toMatchObject({ type: "assetFiles" });
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
    ).toThrow(/outside the overlay's directories/);
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

describe("the generated CSS entry", () => {
  const generatedCss = () =>
    NodeFS.readFileSync(
      NodePath.join(real(appRoot), ".generated", "distribution-mobile", "global.css"),
      "utf8",
    );

  it("imports the app's CSS entry by a relative path, as Uniwind's theme scan only follows those", () => {
    // Uniwind reads the entry's relative imports from disk but hands every other import to Tailwind,
    // which rejects the theme variants (`@variant t3-chat-light`) before Uniwind has declared them:
    // the first Gradle build with an absolute import failed with "unknown variant".
    hook.cssEntryFile("./global.css", { appRoot, env: selected() });
    expect(generatedCss()).toContain('@import "../../global.css";');
  });

  it("scans the app and the overlay's own directories only", () => {
    hook.cssEntryFile("./global.css", { appRoot, env: selected() });
    const sources = [...generatedCss().matchAll(/@source "([^"]+)"/g)].map((match) => match[1]);
    expect(sources).toEqual([real(appRoot), NodePath.join(packDir, "mobile")]);
  });
});
