// @effect-diagnostics nodeBuiltinImport:off - builds throwaway distribution trees on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  readDistributionPackDirs,
  readDistributionWebEntries,
} from "./t3team-packs.distributionWeb.ts";

const HOST = { packUiVersion: 1 };
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

const manifest = (
  id: string,
  extra: { views?: unknown; capabilities?: string[]; hostCapabilities?: string[] } = {},
) => ({
  id,
  version: "1.0.0",
  packApiVersion: 1,
  name: id,
  compatibility: { t3teamCore: "0.x", hostCapabilities: extra.hostCapabilities ?? ["pack-ui:1"] },
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

    expect(readDistributionWebEntries(NodePath.join(root, "dist"), HOST)).toEqual([
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

    expect(readDistributionWebEntries(root, HOST).map((entry) => entry.packId)).toEqual(["solo"]);
  });

  it("fails the build for views without view:v1, a missing entry, or an escaping path", () => {
    const withViews = (views: unknown, capabilities = ["view:v1"]) =>
      tree({
        "distribution.json": {},
        "pack.json": manifest("p", { views, capabilities }),
        "web.ts": "",
      });

    expect(() =>
      readDistributionWebEntries(withViews([{ id: "w", path: "web.ts" }], []), HOST),
    ).toThrow(/without the view:v1 capability/);
    expect(() =>
      readDistributionWebEntries(withViews([{ id: "w", path: "nope.ts" }]), HOST),
    ).toThrow(/view entry not found/);
    expect(() =>
      readDistributionWebEntries(withViews([{ id: "w", path: "../x.ts" }]), HOST),
    ).toThrow(/escapes its pack directory/);
  });

  it("fails the build when two listed packs share an id", () => {
    const root = tree({
      "dist/distribution.json": { packs: ["../a", "../b"] },
      "a/pack.json": manifest("same"),
      "b/pack.json": manifest("same"),
    });

    expect(() => readDistributionWebEntries(NodePath.join(root, "dist"), HOST)).toThrow(
      /listed twice/,
    );
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

  it("fails the build for a pack whose pack-ui range does not include the host's", () => {
    const withPackUi = (hostCapabilities: string[]) =>
      tree({
        "distribution.json": {},
        "pack.json": manifest("p", {
          views: [{ id: "w", path: "web.ts" }],
          capabilities: ["view:v1"],
          hostCapabilities,
        }),
        "web.ts": "",
      });

    expect(() => readDistributionWebEntries(withPackUi(["pack-ui:2"]), HOST)).toThrow(
      /pack p needs pack-ui:2, but this host provides pack-ui:1/,
    );
    expect(() => readDistributionWebEntries(withPackUi([]), HOST)).toThrow(/no pack-ui version/);
    expect(readDistributionWebEntries(withPackUi(["pack-ui:1-2"]), HOST)).toHaveLength(1);
  });
});
