// @effect-diagnostics nodeBuiltinImport:off - builds throwaway distribution trees on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { t3teamDistributionWebPlugin } from "../../../scripts/t3team-distributionWebPlugin";

const roots: string[] = [];
const previousDistribution = process.env.T3CODE_DISTRIBUTION;
afterEach(() => {
  if (previousDistribution === undefined) delete process.env.T3CODE_DISTRIBUTION;
  else process.env.T3CODE_DISTRIBUTION = previousDistribution;
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

/** A real (realpath'd) distribution with one view pack, plus an app dir reached via a symlink. */
function setup() {
  const root = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-dist-web-plugin-")),
  );
  roots.push(root);
  const write = (path: string, content: string) => {
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, path)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, path), content);
  };
  write("dist/distribution.json", "{}");
  write(
    "dist/pack.json",
    JSON.stringify({
      id: "acme",
      version: "1.0.0",
      packApiVersion: 1,
      name: "Acme",
      compatibility: { t3teamCore: "0.x" },
      contents: { views: [{ id: "web", path: "web/index.ts" }] },
      capabilities: ["view:v1"],
      hashes: {},
    }),
  );
  write("dist/web/index.ts", "export default () => {};");
  write("app/src/index.css", '@import "tailwindcss";');
  NodeFS.symlinkSync(NodePath.join(root, "app"), NodePath.join(root, "checkout"));
  process.env.T3CODE_DISTRIBUTION = NodePath.join(root, "dist");
  const plugin = t3teamDistributionWebPlugin({
    packUiImplementation: NodePath.join(root, "checkout/src/packUiImpl.ts"),
    // Configured through the symlink, as a symlinked checkout does.
    stylesheet: NodePath.join(root, "checkout/src/index.css"),
    appModule: NodePath.join(root, "checkout/src/main.tsx"),
  });
  return { root, plugin };
}

type Hook = (this: unknown, ...args: unknown[]) => unknown;
const hook = (value: unknown): Hook =>
  typeof value === "function" ? (value as Hook) : (value as { handler: Hook }).handler;

describe("t3teamDistributionWebPlugin", () => {
  it("adds the pack dirs to Tailwind when the stylesheet's id is its realpath", () => {
    const { root, plugin } = setup();
    const transform = hook(plugin.transform);

    const css = transform.call(
      {},
      '@import "tailwindcss";',
      NodePath.join(root, "app/src/index.css"),
    );

    expect(css).toContain(`@source ${JSON.stringify(NodePath.join(root, "dist"))};`);
  });

  it("refuses a host app alias imported from pack code, and only from pack code", () => {
    const { root, plugin } = setup();
    const resolveId = hook(plugin.resolveId);
    const fromPack = NodePath.join(root, "dist/web/index.ts");

    expect(() => resolveId.call({}, "~/components/ui/button", fromPack, {})).toThrow(
      /host app alias/,
    );
    expect(() => resolveId.call({}, "@/lib/utils", fromPack, {})).toThrow(/host app alias/);
    expect(
      resolveId.call({}, "~/components/ui/button", NodePath.join(root, "app/src/x.ts"), {}),
    ).toBeNull();
  });
});
