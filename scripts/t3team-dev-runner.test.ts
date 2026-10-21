// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - builds a distribution manifest fixture on disk.
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { createDevRunnerEnv, resolveDistributionDesktopIconPng } from "./dev-runner.ts";

it.layer(NodeServices.layer)("dev-runner distribution icon", (it) => {
  describe("createDevRunnerEnv", () => {
    it.effect("exports the distribution's desktop icon for dev:desktop only", () =>
      Effect.gen(function* () {
        const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-distribution-"));
        try {
          NodeFS.mkdirSync(NodePath.join(root, "assets"), { recursive: true });
          NodeFS.writeFileSync(
            NodePath.join(root, "distribution.json"),
            JSON.stringify({ branding: { iconPng: "assets/mark-1024.png" } }),
          );
          NodeFS.writeFileSync(NodePath.join(root, "assets", "mark-1024.png"), "png");

          const desktopEnv = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            baseEnv: { T3CODE_DISTRIBUTION: root },
            serverOffset: 0,
            webOffset: 0,
            t3Home: undefined,
            browser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: undefined,
            devUrl: undefined,
          });
          assert.equal(
            desktopEnv.T3CODE_DESKTOP_ICON_PNG,
            NodePath.join(root, "assets", "mark-1024.png"),
          );

          const browserEnv = yield* createDevRunnerEnv({
            mode: "dev",
            baseEnv: { T3CODE_DISTRIBUTION: root },
            serverOffset: 0,
            webOffset: 0,
            t3Home: undefined,
            browser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: undefined,
            devUrl: undefined,
          });
          assert.equal(browserEnv.T3CODE_DESKTOP_ICON_PNG, undefined);
        } finally {
          NodeFS.rmSync(root, { recursive: true, force: true });
        }
      }),
    );
  });

  describe("resolveDistributionDesktopIconPng", () => {
    it("resolves branding.iconPng against the distribution directory", () => {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-distribution-"));
      try {
        NodeFS.writeFileSync(
          NodePath.join(root, "distribution.json"),
          JSON.stringify({ branding: { iconPng: "assets/mark-1024.png" } }),
        );
        assert.equal(
          resolveDistributionDesktopIconPng({ T3CODE_DISTRIBUTION: root }),
          NodePath.join(root, "assets", "mark-1024.png"),
        );
      } finally {
        NodeFS.rmSync(root, { recursive: true, force: true });
      }
    });

    it("lets an explicit T3CODE_DESKTOP_ICON_PNG win", () => {
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-distribution-"));
      try {
        NodeFS.writeFileSync(
          NodePath.join(root, "distribution.json"),
          JSON.stringify({ branding: { iconPng: "assets/mark-1024.png" } }),
        );
        assert.equal(
          resolveDistributionDesktopIconPng({
            T3CODE_DISTRIBUTION: root,
            T3CODE_DESKTOP_ICON_PNG: "/explicit/icon.png",
          }),
          undefined,
        );
      } finally {
        NodeFS.rmSync(root, { recursive: true, force: true });
      }
    });

    it("stays a no-op without a distribution, a manifest, or an iconPng field", () => {
      assert.equal(resolveDistributionDesktopIconPng({}), undefined);
      assert.equal(
        resolveDistributionDesktopIconPng({ T3CODE_DISTRIBUTION: "/missing/dir" }),
        undefined,
      );
      const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-distribution-"));
      try {
        assert.equal(resolveDistributionDesktopIconPng({ T3CODE_DISTRIBUTION: root }), undefined);
        NodeFS.writeFileSync(NodePath.join(root, "distribution.json"), "not json");
        assert.equal(resolveDistributionDesktopIconPng({ T3CODE_DISTRIBUTION: root }), undefined);
        NodeFS.writeFileSync(NodePath.join(root, "distribution.json"), "{}");
        assert.equal(resolveDistributionDesktopIconPng({ T3CODE_DISTRIBUTION: root }), undefined);
      } finally {
        NodeFS.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
