// @effect-diagnostics nodeBuiltinImport:off - migration tests read and write home and profile trees on disk.
import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { migrateLegacyHomeIfNeeded } from "./DesktopBackendConfiguration.ts";
import {
  detectHomeOwnership,
  detectProfileOwnership,
  migrateExistingNexiUser,
  migrateNexiHome,
  migrateNexiProfile,
  migrationWarningForUser,
  readMigrationStatus,
  readNexiIdentityMarker,
  writeNexiIdentityMarker,
} from "./t3team-homeMigration.ts";

const REAL_DB_BYTES = 64 * 1024;
const EMPTY_DB_BYTES = 4096;

const makeTree = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "legacy-home-"));
  return {
    root,
    legacyDir: NodePath.join(root, ".t3"),
    brandedDir: NodePath.join(root, "nexi-work"),
    profileDir: NodePath.join(root, "t3code-v2"),
    isolatedProfile: NodePath.join(root, "nexi-work", "electron-profile"),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const writeState = (homeDir: string, bytes: number, file = "statev2.sqlite") => {
  NodeFS.mkdirSync(NodePath.join(homeDir, "userdata"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(homeDir, "userdata", file), Buffer.alloc(bytes, 1));
};

const writeNexiHome = (homeDir: string, bytes = REAL_DB_BYTES) => {
  writeState(homeDir, bytes);
  writeNexiIdentityMarker(
    homeDir,
    { product: "nexi-work", productName: "Nexi Work" },
    NodePath.join,
  );
};

const writeProfile = (profileDir: string, state = '{"os_crypt":{"encrypted_key":"test-key"}}') => {
  NodeFS.mkdirSync(NodePath.join(profileDir, "Local Storage"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(profileDir, "Local State"), state);
  NodeFS.writeFileSync(NodePath.join(profileDir, "Cookies"), "cookies");
  NodeFS.writeFileSync(NodePath.join(profileDir, "SingletonLock"), "lock");
};

const run = (legacyDir: string, brandedDir: string) =>
  migrateLegacyHomeIfNeeded({
    legacyDir,
    brandedDir,
    join: NodePath.join,
    stamp: "testcase",
  });

describe("detectHomeOwnership", () => {
  it("treats a real ~/.t3 without a Nexi marker as upstream", () => {
    const { legacyDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      assert.equal(detectHomeOwnership(legacyDir, NodePath.join), "upstream");
    } finally {
      cleanup();
    }
  });

  it("treats a nexi-work home with a real database as Nexi's, and a marked ~/.t3 as Nexi's", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      assert.equal(detectHomeOwnership(brandedDir, NodePath.join), "nexi");
      writeNexiHome(legacyDir);
      assert.equal(detectHomeOwnership(legacyDir, NodePath.join), "nexi");
    } finally {
      cleanup();
    }
  });
});

describe("migrateLegacyHomeIfNeeded", () => {
  it("copies a Nexi-owned home into the branded one and leaves the source in place", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeNexiHome(legacyDir);
      NodeFS.mkdirSync(NodePath.join(legacyDir, "worktrees", "proj"), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(legacyDir, "userdata", "clerk-tokens.json"), '{"t":1}');

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(brandedDir, "worktrees", "proj")));
      assert.strictEqual(
        NodeFS.readFileSync(NodePath.join(brandedDir, "userdata", "clerk-tokens.json"), "utf8"),
        '{"t":1}',
      );
      // Source is a copy, never a move or a delete.
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "worktrees", "proj")));
      assert.isDefined(readNexiIdentityMarker(brandedDir, NodePath.join));
    } finally {
      cleanup();
    }
  });

  it("never touches an upstream-owned ~/.t3", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      NodeFS.mkdirSync(NodePath.join(legacyDir, "worktrees", "proj"), { recursive: true });

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")));
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "worktrees", "proj")));
      assert.equal(
        migrateNexiHome({
          legacyDir,
          brandedDir,
          join: NodePath.join,
          stamp: "testcase",
        }).status,
        "skipped-upstream",
      );
    } finally {
      cleanup();
    }
  });

  it("adopts a Nexi home even when a blank branded DB already exists, without deleting it", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeNexiHome(legacyDir);
      writeState(brandedDir, EMPTY_DB_BYTES);

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      // The empty placeholder was moved aside, never deleted; the source is intact.
      assert.isTrue(
        NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite.empty-testcase")),
      );
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
    } finally {
      cleanup();
    }
  });

  it("never clobbers a branded home that is actually in use", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeNexiHome(legacyDir);
      writeState(brandedDir, REAL_DB_BYTES * 2);

      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES * 2,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")));
    } finally {
      cleanup();
    }
  });

  it("is a no-op when there is no legacy home to adopt", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")));
    } finally {
      cleanup();
    }
  });

  it("is a no-op when both directories are the same", () => {
    const { brandedDir, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      assert.strictEqual(run(brandedDir, brandedDir), brandedDir);
    } finally {
      cleanup();
    }
  });

  it("is idempotent: a second run does not change a completed copy", () => {
    const { legacyDir, brandedDir, cleanup } = makeTree();
    try {
      writeNexiHome(legacyDir);
      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      NodeFS.writeFileSync(NodePath.join(legacyDir, "userdata", "clerk-tokens.json"), "later");
      assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "clerk-tokens.json")));
    } finally {
      cleanup();
    }
  });

  describe("when the legacy home is a symlink", () => {
    it("never copies another install's live home into a new branded home", () => {
      const { root, legacyDir, brandedDir, cleanup } = makeTree();
      try {
        const liveHome = NodePath.join(root, "live-nexi-work");
        writeState(liveHome, REAL_DB_BYTES);
        NodeFS.symlinkSync(liveHome, legacyDir, "dir");

        assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
        assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")));
        assert.strictEqual(
          NodeFS.statSync(NodePath.join(liveHome, "userdata", "statev2.sqlite")).size,
          REAL_DB_BYTES,
        );
      } finally {
        cleanup();
      }
    });

    it("replaces a symlink to the branded home with a real copy and leaves the Nexi home intact", () => {
      const { legacyDir, brandedDir, cleanup } = makeTree();
      try {
        writeState(brandedDir, REAL_DB_BYTES);
        NodeFS.symlinkSync(brandedDir, legacyDir, "dir");

        assert.strictEqual(run(legacyDir, brandedDir), brandedDir);
        assert.strictEqual(
          NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
          REAL_DB_BYTES,
        );
        assert.isFalse(NodeFS.lstatSync(legacyDir).isSymbolicLink());
        assert.strictEqual(
          NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
          REAL_DB_BYTES,
        );
        // The two directories are now independent: a write to one is not a write to the other.
        NodeFS.writeFileSync(NodePath.join(legacyDir, "userdata", "only-legacy"), "x");
        assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "only-legacy")));
      } finally {
        cleanup();
      }
    });
  });
});

describe("migrateNexiProfile", () => {
  it("copies a Nexi-owned t3code-v2 profile and leaves lock files and the source in place", () => {
    const { brandedDir, profileDir, isolatedProfile, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      writeProfile(profileDir);
      const result = migrateNexiProfile({
        sourceProfileDir: profileDir,
        destinationProfileDir: isolatedProfile,
        join: NodePath.join,
        stamp: "testcase",
        adjacentNexiHome: brandedDir,
        platform: "linux",
      });
      assert.equal(result.status, "ok");
      assert.isTrue(result.copied);
      assert.equal(
        NodeFS.readFileSync(NodePath.join(isolatedProfile, "Local State"), "utf8"),
        '{"os_crypt":{"encrypted_key":"test-key"}}',
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(isolatedProfile, "Cookies")));
      assert.isFalse(NodeFS.existsSync(NodePath.join(isolatedProfile, "SingletonLock")));
      assert.isTrue(NodeFS.existsSync(NodePath.join(profileDir, "Local State")));
      assert.isTrue(NodeFS.existsSync(NodePath.join(profileDir, "SingletonLock")));
    } finally {
      cleanup();
    }
  });

  it("does not adopt an upstream t3code-v2 when there is no Nexi home", () => {
    const { root, profileDir, cleanup } = makeTree();
    try {
      writeProfile(profileDir);
      const dest = NodePath.join(root, "fresh-profile");
      const result = migrateNexiProfile({
        sourceProfileDir: profileDir,
        destinationProfileDir: dest,
        join: NodePath.join,
        stamp: "testcase",
        platform: "linux",
      });
      assert.equal(result.status, "skipped-upstream");
      assert.isFalse(NodeFS.existsSync(NodePath.join(dest, "Local State")));
      assert.isTrue(NodeFS.existsSync(NodePath.join(profileDir, "Local State")));
    } finally {
      cleanup();
    }
  });

  it("records a visible safeStorage warning on macOS after a profile copy", () => {
    const { brandedDir, profileDir, isolatedProfile, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      writeProfile(profileDir);
      const result = migrateNexiProfile({
        sourceProfileDir: profileDir,
        destinationProfileDir: isolatedProfile,
        join: NodePath.join,
        stamp: "testcase",
        adjacentNexiHome: brandedDir,
        platform: "darwin",
      });
      assert.equal(result.status, "ok");
      assert.equal(result.safeStorage, "unknown");
      const status = readMigrationStatus(isolatedProfile, NodePath.join);
      const warning = migrationWarningForUser(status);
      assert.isDefined(warning);
      assert.match(warning!, /sign in again/i);
    } finally {
      cleanup();
    }
  });

  it("records a successful Windows profile copy as copied, not windows-local-state", () => {
    const { brandedDir, profileDir, isolatedProfile, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      writeProfile(profileDir);
      const result = migrateNexiProfile({
        sourceProfileDir: profileDir,
        destinationProfileDir: isolatedProfile,
        join: NodePath.join,
        stamp: "testcase",
        adjacentNexiHome: brandedDir,
        platform: "win32",
      });
      assert.equal(result.status, "ok");
      assert.equal(result.safeStorage, "copied");
      const status = readMigrationStatus(isolatedProfile, NodePath.join);
      assert.equal(status?.safeStorage, "copied");
      assert.isUndefined(migrationWarningForUser(status));
    } finally {
      cleanup();
    }
  });
});

describe("existing Nexi user upgrade", () => {
  it("keeps an existing Nexi user's home and copies their shared profile, leaving upstream paths intact", () => {
    const { legacyDir, brandedDir, profileDir, isolatedProfile, cleanup } = makeTree();
    try {
      // Today's packaged Nexi user: state already in nexi-work, profile in t3code-v2.
      writeState(brandedDir, REAL_DB_BYTES);
      NodeFS.writeFileSync(
        NodePath.join(brandedDir, "userdata", "clerk-tokens.json"),
        '{"nexi":true}',
      );
      writeProfile(profileDir, '{"os_crypt":{"encrypted_key":"nexi-key"}}');
      // An unrelated upstream ~/.t3 also exists and must not be touched.
      writeState(legacyDir, REAL_DB_BYTES * 2);

      const result = migrateExistingNexiUser({
        defaultLegacyHome: legacyDir,
        brandedHome: brandedDir,
        sharedProfileDir: profileDir,
        isolatedProfileDir: isolatedProfile,
        join: NodePath.join,
        stamp: "upgrade",
        platform: "linux",
        appId: "ch.nexplore.nexi.work",
        productName: "Nexi Work",
      });

      assert.equal(result.home, brandedDir);
      assert.equal(result.homeResult.status, "skipped-existing");
      assert.equal(result.profileResult?.status, "ok");
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.strictEqual(
        NodeFS.readFileSync(NodePath.join(brandedDir, "userdata", "clerk-tokens.json"), "utf8"),
        '{"nexi":true}',
      );
      assert.strictEqual(
        NodeFS.readFileSync(NodePath.join(isolatedProfile, "Local State"), "utf8"),
        '{"os_crypt":{"encrypted_key":"nexi-key"}}',
      );
      // Sources intact.
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES * 2,
      );
      assert.strictEqual(
        NodeFS.readFileSync(NodePath.join(profileDir, "Local State"), "utf8"),
        '{"os_crypt":{"encrypted_key":"nexi-key"}}',
      );
      assert.isDefined(readNexiIdentityMarker(brandedDir, NodePath.join));
    } finally {
      cleanup();
    }
  });

  it("does not adopt an upstream ~/.t3 or t3code-v2 for a fresh Nexi install", () => {
    const { legacyDir, brandedDir, profileDir, isolatedProfile, cleanup } = makeTree();
    try {
      writeState(legacyDir, REAL_DB_BYTES);
      writeProfile(profileDir);

      const result = migrateExistingNexiUser({
        defaultLegacyHome: legacyDir,
        brandedHome: brandedDir,
        sharedProfileDir: profileDir,
        isolatedProfileDir: isolatedProfile,
        join: NodePath.join,
        stamp: "fresh",
        platform: "linux",
      });

      assert.equal(result.home, brandedDir);
      assert.equal(result.homeResult.status, "skipped-upstream");
      assert.equal(result.profileResult?.status, "skipped-upstream");
      assert.isFalse(NodeFS.existsSync(NodePath.join(brandedDir, "userdata", "statev2.sqlite")));
      assert.isFalse(NodeFS.existsSync(NodePath.join(isolatedProfile, "Local State")));
      assert.strictEqual(
        NodeFS.statSync(NodePath.join(legacyDir, "userdata", "statev2.sqlite")).size,
        REAL_DB_BYTES,
      );
      assert.isTrue(NodeFS.existsSync(NodePath.join(profileDir, "Local State")));
    } finally {
      cleanup();
    }
  });
});

describe("detectProfileOwnership", () => {
  it("treats t3code-v2 as Nexi's when the adjacent nexi-work home is in use", () => {
    const { brandedDir, profileDir, cleanup } = makeTree();
    try {
      writeState(brandedDir, REAL_DB_BYTES);
      writeProfile(profileDir);
      assert.equal(detectProfileOwnership(profileDir, NodePath.join, brandedDir), "nexi");
      assert.equal(detectProfileOwnership(profileDir, NodePath.join), "upstream");
    } finally {
      cleanup();
    }
  });
});
