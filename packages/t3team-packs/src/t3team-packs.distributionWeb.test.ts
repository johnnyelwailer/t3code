// @effect-diagnostics nodeBuiltinImport:off - builds throwaway distribution trees on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  packWebImportProblem,
  readDistributionPackDirs,
  readDistributionWebEntries,
} from "./t3team-packs.distributionWeb.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

function tree(files: Record<string, unknown>): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-distribution-web-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = NodePath.join(root, path);
    NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
    NodeFS.writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

const manifest = (id: string, extra: { views?: unknown; capabilities?: string[] } = {}) => ({
  id,
  version: "1.0.0",
  packApiVersion: 1,
  name: id,
  compatibility: { t3teamCore: "0.x" },
  contents: extra.views === undefined ? {} : { views: extra.views },
  capabilities: extra.capabilities ?? [],
  hashes: {},
});

describe("readDistributionWebEntries", () => {
  it("reads every listed pack's views, in packs[] order, and skips packs without views", () => {
    const root = tree({
      "dist/distribution.json": { entry: "activate.ts", packs: [".", "../standup"] },
      "dist/pack.json": manifest("brand"),
      "standup/pack.json": manifest("standup", {
        views: [{ id: "web", path: "web/index.ts" }],
        capabilities: ["view:v1"],
      }),
      "standup/web/index.ts": "export default () => {};",
    });

    expect(readDistributionWebEntries(NodePath.join(root, "dist"))).toEqual([
      {
        packId: "standup",
        packDir: NodePath.join(root, "standup"),
        entryPath: NodePath.join(root, "standup/web/index.ts"),
      },
    ]);
  });

  it("treats a distribution without packs[] as its own single pack", () => {
    const root = tree({
      "distribution.json": { entry: "activate.ts" },
      "pack.json": manifest("solo", {
        views: [{ id: "web", path: "web.ts" }],
        capabilities: ["view:v1"],
      }),
      "web.ts": "",
    });

    expect(readDistributionWebEntries(root).map((entry) => entry.packId)).toEqual(["solo"]);
  });

  it("fails the build for views without view:v1, a missing entry, or an escaping path", () => {
    const withViews = (views: unknown, capabilities = ["view:v1"]) =>
      tree({
        "distribution.json": {},
        "pack.json": manifest("p", { views, capabilities }),
        "web.ts": "",
      });

    expect(() => readDistributionWebEntries(withViews([{ id: "w", path: "web.ts" }], []))).toThrow(
      /without the view:v1 capability/,
    );
    expect(() => readDistributionWebEntries(withViews([{ id: "w", path: "nope.ts" }]))).toThrow(
      /view entry not found/,
    );
    expect(() => readDistributionWebEntries(withViews([{ id: "w", path: "../x.ts" }]))).toThrow(
      /escapes its pack directory/,
    );
  });

  it("fails the build when two listed packs share an id", () => {
    const root = tree({
      "dist/distribution.json": { packs: ["../a", "../b"] },
      "a/pack.json": manifest("same"),
      "b/pack.json": manifest("same"),
    });

    expect(() => readDistributionWebEntries(NodePath.join(root, "dist"))).toThrow(/listed twice/);
  });

  it("keeps packs[] to the distribution and its sibling packs", () => {
    const root = tree({
      "packs/dist/distribution.json": {},
      "packs/dist/pack.json": manifest("d"),
    });
    const dist = NodePath.join(root, "packs/dist");
    const withPacks = (packs: string[]) => {
      NodeFS.writeFileSync(NodePath.join(dist, "distribution.json"), JSON.stringify({ packs }));
      return () => readDistributionPackDirs(dist);
    };

    expect(withPacks([".", "../sibling"])()).toEqual([dist, NodePath.join(root, "packs/sibling")]);
    for (const escape of ["../../x", "..", "/etc", "../sibling/../../x"]) {
      expect(withPacks([escape])).toThrow(/must be the distribution or a sibling pack/);
    }
  });
});

describe("packWebImportProblem", () => {
  it("refuses the host app's path aliases and allows packages", () => {
    expect(packWebImportProblem("~/components/ui/button")).toMatch(/host app alias/);
    expect(packWebImportProblem("@/lib/utils")).toMatch(/host app alias/);
    expect(packWebImportProblem("@t3team/pack-ui")).toBeNull();
    expect(packWebImportProblem("effect/Schema")).toBeNull();
  });
});
