/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- Unit eval for the meta-repo manifest decode and gitignore split (GHE #42). */
// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node fs helpers.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  GITIGNORE_ENTRY,
  META_REPOSITORY_GITIGNORE_ENTRIES,
} from "./t3team-project-repository-utils.ts";
import { ensureWorkspaceGitignore } from "./t3team-project-repository-services.ts";
import { metaRepositoryFromManifestJson } from "./t3team-toolBrokerStartChildContext.ts";

describe("t3team meta-repo (monorepo-as-metarepo, GHE #42)", () => {
  it("decodes the metaRepository entry from a reference manifest", () => {
    const manifest = JSON.stringify({
      metaRepository: {
        url: "https://github.com/owner/mono",
        localPath: "/tmp/mono",
        status: "adopted",
      },
      linkedRepositories: [],
    });
    expect(metaRepositoryFromManifestJson(manifest)).toEqual({
      url: "https://github.com/owner/mono",
      localPath: "/tmp/mono",
    });
  });

  it("decodes a metaRepository entry without a remote url", () => {
    const manifest = JSON.stringify({
      metaRepository: { localPath: "/tmp/mono", status: "adopted" },
    });
    expect(metaRepositoryFromManifestJson(manifest)).toEqual({ localPath: "/tmp/mono" });
  });

  it("returns undefined for legacy wrapped manifests, malformed json, or empty localPath", () => {
    expect(metaRepositoryFromManifestJson('{"linkedRepositories": []}')).toBeUndefined();
    expect(metaRepositoryFromManifestJson("not json")).toBeUndefined();
    expect(
      metaRepositoryFromManifestJson(
        JSON.stringify({ metaRepository: { localPath: "  ", status: "adopted" } }),
      ),
    ).toBeUndefined();
    expect(
      metaRepositoryFromManifestJson(JSON.stringify({ metaRepository: null })),
    ).toBeUndefined();
  });

  describe("ensureWorkspaceGitignore meta-repo split", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-metarepo-gitignore-"));
    afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

    it("writes the narrow machine-local entries for adopted meta-repos", async () => {
      const workspaceRoot = NodePath.join(root, "adopted");
      NodeFS.mkdirSync(workspaceRoot, { recursive: true });
      await Effect.runPromise(
        ensureWorkspaceGitignore(workspaceRoot, META_REPOSITORY_GITIGNORE_ENTRIES).pipe(
          Effect.provide(NodeServices.layer),
        ),
      );
      const gitignore = NodeFS.readFileSync(NodePath.join(workspaceRoot, ".gitignore"), "utf8");
      for (const entry of META_REPOSITORY_GITIGNORE_ENTRIES) {
        expect(gitignore).toContain(entry);
      }
      // The whole-.t3team/ entry must NOT be written: committed team state stays committable.
      expect(
        gitignore
          .split(/\r?\n/)
          .map((line) => line.trim())
          .includes(GITIGNORE_ENTRY),
      ).toBe(false);
    });

    it("defaults to the legacy whole-.t3team/ entry and is idempotent", async () => {
      const workspaceRoot = NodePath.join(root, "legacy");
      NodeFS.mkdirSync(workspaceRoot, { recursive: true });
      await Effect.runPromise(
        ensureWorkspaceGitignore(workspaceRoot).pipe(Effect.provide(NodeServices.layer)),
      );
      await Effect.runPromise(
        ensureWorkspaceGitignore(workspaceRoot).pipe(Effect.provide(NodeServices.layer)),
      );
      const gitignore = NodeFS.readFileSync(NodePath.join(workspaceRoot, ".gitignore"), "utf8");
      const occurrences = gitignore
        .split(/\r?\n/)
        .filter((line) => line.trim() === GITIGNORE_ENTRY);
      expect(occurrences).toHaveLength(1);
    });

    it("adds missing meta-repo entries to an existing gitignore without duplicating", async () => {
      const workspaceRoot = NodePath.join(root, "mixed");
      NodeFS.mkdirSync(workspaceRoot, { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(workspaceRoot, ".gitignore"),
        `${META_REPOSITORY_GITIGNORE_ENTRIES[0]}\nnode_modules/\n`,
        "utf8",
      );
      await Effect.runPromise(
        ensureWorkspaceGitignore(workspaceRoot, META_REPOSITORY_GITIGNORE_ENTRIES).pipe(
          Effect.provide(NodeServices.layer),
        ),
      );
      const gitignore = NodeFS.readFileSync(NodePath.join(workspaceRoot, ".gitignore"), "utf8");
      expect(gitignore).toContain("node_modules/");
      for (const entry of META_REPOSITORY_GITIGNORE_ENTRIES) {
        expect(gitignore.split(/\r?\n/).filter((line) => line.trim() === entry)).toHaveLength(1);
      }
    });
  });
});
