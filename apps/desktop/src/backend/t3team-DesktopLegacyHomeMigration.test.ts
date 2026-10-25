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

const writeState = (homeDir: string, bytes: number, file = "state.sqlite") => {
  NodeFS.mkdirSync(NodePath.join(homeDir, "userdata"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(homeDir, "userdata", file), Buffer.alloc(bytes));
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

  it("adopts a legacy home that only has the V2 database", () => {
    // A fresh V2 install never creates state.sqlite; its workspace lives in statev2.sqlite.
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES, "statev2.sqlite");

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
    } finally {
      cleanup();
    }
  });

  it("never clobbers a branded home whose workspace is only in the V2 database", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      writeState(brandedDir, REAL_DB_BYTES * 2, "statev2.sqlite");

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES * 2,
      );
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata.empty-testcase")));
      assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "userdata", "state.sqlite")));
    } finally {
      cleanup();
    }
  });

  describe("when the legacy home is a symlink", () => {
    // PJ's machine: `~/.t3` is a symlink to the installed app's branded home. A differently
    // branded build starting with an empty home of its own must leave that live home alone.
    it("never moves the live home of another install into a new branded home", () => {
      const { root, legacyDir, brandedDir, cleanup } = makeTree();
      try {
        const liveHome = NodePath.join(root, "live-nexi-work");
        writeState(liveHome, REAL_DB_BYTES, "statev2.sqlite");
        NodeFS.symlinkSync(liveHome, legacyDir, "dir");

        assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
        assert.isFalse(NodeFS.existsSync(brandedDir));
        assert.strictEqual(
          NodeFS.statSync(NodePath.join(liveHome, "userdata", "statev2.sqlite")).size,
          REAL_DB_BYTES,
        );
      } finally {
        cleanup();
      }
    });

    it("treats a symlink that resolves to the branded home as the same home", () => {
      const { legacyDir, brandedDir, cleanup } = makeTree();
      try {
        writeState(brandedDir, REAL_DB_BYTES, "statev2.sqlite");
        NodeFS.symlinkSync(brandedDir, legacyDir, "dir");

        assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
        assert.strictEqual(
          NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
          REAL_DB_BYTES,
        );
        assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata.empty-testcase")));
      } finally {
        cleanup();
      }
    });

    it("also refuses when the branded dir is itself reached through a symlink", () => {
      const { root, legacyDir, brandedDir, cleanup } = makeTree();
      try {
        writeState(legacyDir, REAL_DB_BYTES);
        const alias = NodePath.join(root, "alias");
        NodeFS.mkdirSync(brandedDir, { recursive: true });
        NodeFS.symlinkSync(legacyDir, alias, "dir");

        // `alias` resolves to the legacy dir, so there is nothing to move.
        assert.strictEqual(run(legacyDir, alias), alias);
        assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "userdata", "state.sqlite")));
      } finally {
        cleanup();
      }
    });
  });
});
