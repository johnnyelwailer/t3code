// @effect-diagnostics preferSchemaOverJson:off - fixtures assert the raw JSON bytes the state migration writes.
// @effect-diagnostics nodeBuiltinImport:off - filesystem/CAS integration test uses temp disk helpers.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, vi } from "vite-plus/test";
import { normalizeProjectContextStateFile } from "./t3team-projectContextStatePaths.ts";

describe("physical context JSON paths", () => {
  it("keeps browser-built entrypoints and nested work-item references self-consistent under .nexi", () => {
    const file = normalizeProjectContextStateFile(
      {
        relativePath: ".t3team/context/entrypoint.json",
        contents: JSON.stringify({
          paths: { manifest: ".t3team/context/manifest.json" },
          items: [{ ticketEntryPointRelativePath: ".t3team/context/jira/x/entrypoint.json" }],
          absolute: "/workspace/.t3team/context/a.json",
          description: "See .t3team/context",
          journal: ".t3team-runs/x",
        }),
      },
      ".nexi",
    );
    expect(file.relativePath).toBe(".nexi/context/entrypoint.json");
    expect(JSON.parse(file.contents)).toEqual({
      paths: { manifest: ".nexi/context/manifest.json" },
      items: [{ ticketEntryPointRelativePath: ".nexi/context/jira/x/entrypoint.json" }],
      absolute: "/workspace/.nexi/context/a.json",
      description: "See .t3team/context",
      journal: ".t3team-runs/x",
    });
    expect(normalizeProjectContextStateFile(file, ".nexi")).toEqual(file);
  });
  it("preserves flag-off JSON bytes exactly", () => {
    const file = {
      relativePath: ".t3team/context/entrypoint.json",
      contents: '{"paths":{"manifest":".t3team/context/m.json"}}',
    };
    expect(normalizeProjectContextStateFile(file, ".t3team")).toBe(file);
  });
  it("preserves non-JSON, invalid JSON, and binary data", () => {
    for (const file of [
      { relativePath: ".t3team/context/x.md", contents: ".t3team/context/x" },
      { relativePath: ".t3team/context/x.json", contents: "invalid" },
      { relativePath: ".t3team/context/x.json", contents: "e30=", encoding: "base64" as const },
    ])
      expect(normalizeProjectContextStateFile(file, ".nexi").contents).toBe(file.contents);
  });
});

it.effect("persists the browser mirror with physical paths before CAS hashing", () =>
  Effect.gen(function* () {
    vi.stubEnv("NEXI_FF_NEXI_STATE_DIR", "1");
    vi.resetModules();
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-context-mirror-"));
    try {
      const [NodeServices, persistence, workspace, writer] = yield* Effect.promise(() =>
        Promise.all([
          import("@effect/platform-node/NodeServices"),
          import("./persistence/Sqlite.ts"),
          import("./workspace/WorkspacePaths.ts"),
          import("./t3team-project-workspace-context-files.ts"),
        ]),
      );
      const result = yield* writer
        .writeT3TeamWorkspaceContextFiles({
          workspaceRoot: root,
          files: [
            {
              relativePath: ".t3team/context/entrypoint.json",
              contents: '{"paths":{"manifest":".t3team/context/manifest.json"}}',
            },
            { relativePath: ".t3team/context/manifest.json", contents: "{}" },
          ],
        })
        .pipe(
          Effect.provide(
            Layer.mergeAll(
              NodeServices.layer,
              persistence.layerMemory,
              workspace.layer.pipe(Layer.provide(NodeServices.layer)),
            ),
          ),
        );
      expect(result.writtenFiles).toEqual([
        ".nexi/context/entrypoint.json",
        ".nexi/context/manifest.json",
      ]);
      const contents = NodeFS.readFileSync(
        NodePath.join(root, ".nexi/context/entrypoint.json"),
        "utf8",
      );
      expect(JSON.parse(contents).paths.manifest).toBe(".nexi/context/manifest.json");
      expect(NodeFS.existsSync(NodePath.join(root, JSON.parse(contents).paths.manifest))).toBe(
        true,
      );
      expect(NodeFS.existsSync(NodePath.join(root, ".t3team"))).toBe(false);
    } finally {
      NodeFS.rmSync(root, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }),
);
