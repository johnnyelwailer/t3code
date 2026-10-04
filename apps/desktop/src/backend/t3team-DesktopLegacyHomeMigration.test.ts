// @effect-diagnostics nodeBuiltinImport:off - migration test reads the legacy home tree from disk.
import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { migrateLegacyHomeIfNeeded } from "./DesktopBackendConfiguration.ts";

const REAL_DB_BYTES = 64 * 1024;
const EMPTY_DB_BYTES = 4096;

const makeTree = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "legacy-home-"));
  return {
    root,
    legacyDir: NodePath.join(root, "legacy"),
    brandedDir: NodePath.join(root, "branded"),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const writeState = (homeDir: string, bytes: number) => {
  NodeFS.mkdirSync(NodePath.join(homeDir, "userdata"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(homeDir, "userdata", "state.sqlite"), Buffer.alloc(bytes));
};

const run = (legacyDir: string, brandedDir: string) =>
  migrateLegacyHomeIfNeeded({
    legacyDir,
    brandedDir,
    join: NodePath.join,
    stamp: "testcase",
  });

describe("migrateLegacyHomeIfNeeded", () => {
  it("moves a pre-branding home into the branded one, worktrees and all", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      NodeFS.mkdirSync(NodePath.join(legacyDir, "worktrees", "proj"), { recursive: true });

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "state.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(brandedDir, "worktrees", "proj")));
    } finally {
      cleanup();
    }
  });

  it("adopts the legacy home even when a blank branded DB already exists", () => {
    // The regression this migration exists for: a first launch of a branded
    // build creates an empty workspace, which must not then block adoption.
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      writeState(brandedDir, EMPTY_DB_BYTES);

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "state.sqlite")).size,
        REAL_DB_BYTES,
      );
      // Moved aside, never deleted.
      assert.isTrue(NodeFS.existsSync(NodePath.join(brandedDir, "userdata.empty-testcase")));
    } finally {
      cleanup();
    }
  });

  it("never clobbers a branded home that is actually in use", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      writeState(brandedDir, REAL_DB_BYTES * 2);

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "state.sqlite")).size,
        REAL_DB_BYTES * 2,
      );
      // The legacy home is left exactly where it was.
      assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "userdata", "state.sqlite")));
    } finally {
      cleanup();
    }
  });

  it("is a no-op when there is no legacy home to adopt", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata")));
    } finally {
      cleanup();
    }
  });

  it("is a no-op for unbundled builds, where both directories are the same", () => {
    const { legacyDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      assert.strictEqual(run(legacyDir, legacyDir), legacyDir);
      assert.isFalse(NodeFS.existsSync(NodePath.join(legacyDir, "userdata.empty-testcase")));
    } finally {
      cleanup();
    }
  });
});
