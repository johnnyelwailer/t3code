// @effect-diagnostics nodeBuiltinImport:off - tests write catalog and environment files on disk.
import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import {
  migrateNexiProfile,
  migrationWarningForUser,
  readMigrationStatus,
  SAFE_STORAGE_SIGN_IN_WARNING,
  writeMigrationStatus,
  writeNexiIdentityMarker,
} from "./t3team-homeMigration.ts";
import {
  finalizeSafeStorageMigration,
  markSafeStorageWarningShown,
  needsSafeStorageVerification,
  reencryptSafeStorageSecrets,
  SAFE_STORAGE_BACKUP_SUFFIX,
  shouldPresentSignInWarning,
  type SafeStorageBackend,
} from "./t3team-safeStorageMigration.ts";

const makeTree = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "safe-storage-mig-"));
  const stateDir = NodePath.join(root, "nexi-work", "userdata");
  NodeFS.mkdirSync(stateDir, { recursive: true });
  return {
    root,
    homeDir: NodePath.join(root, "nexi-work"),
    stateDir,
    profileDir: NodePath.join(root, "nexi-work", "electron-profile"),
    sourceProfile: NodePath.join(root, "t3code-v2"),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const makeBackend = (prefix: string): SafeStorageBackend => ({
  isEncryptionAvailable: () => true,
  encryptString: (value) => new Uint8Array(Buffer.from(`${prefix}:${value}`, "utf8")),
  decryptString: (value) => {
    const text = Buffer.from(value).toString("utf8");
    const expected = `${prefix}:`;
    if (!text.startsWith(expected)) return undefined;
    return text.slice(expected.length);
  },
});

const unavailableBackend: SafeStorageBackend = {
  isEncryptionAvailable: () => false,
  encryptString: () => undefined,
  decryptString: () => undefined,
};

const writeCatalog = (stateDir: string, prefix: string, plaintext: string) => {
  const encryptedCatalog = Buffer.from(`${prefix}:${plaintext}`, "utf8").toString("base64");
  NodeFS.writeFileSync(
    NodePath.join(stateDir, "connection-catalog.json"),
    `${JSON.stringify({ version: 1, encryptedCatalog }, null, 2)}\n`,
  );
};

const writeEnvironments = (
  stateDir: string,
  tokens: ReadonlyArray<{
    readonly id: string;
    readonly prefix: string;
    readonly plaintext: string;
  }>,
) => {
  const records = tokens.map((token) => ({
    environmentId: token.id,
    label: token.id,
    httpBaseUrl: "https://example.invalid",
    wsBaseUrl: "wss://example.invalid",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastConnectedAt: null,
    encryptedBearerToken: Buffer.from(`${token.prefix}:${token.plaintext}`, "utf8").toString(
      "base64",
    ),
  }));
  NodeFS.writeFileSync(
    NodePath.join(stateDir, "saved-environments.json"),
    `${JSON.stringify({ version: 1, records }, null, 2)}\n`,
  );
};

const readCatalogPlaintext = (
  stateDir: string,
  backend: SafeStorageBackend,
): string | undefined => {
  const document = JSON.parse(
    NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"), "utf8"),
  ) as { encryptedCatalog: string };
  return backend.decryptString(Buffer.from(document.encryptedCatalog, "base64"));
};

describe("reencryptSafeStorageSecrets", () => {
  it("verifies payloads that already decrypt under the current identity and leaves the files in place", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current = makeBackend("new");
      writeCatalog(stateDir, "new", "catalog-secret");
      writeEnvironments(stateDir, [{ id: "env-1", prefix: "new", plaintext: "bearer-1" }]);
      const beforeCatalog = NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"));
      const beforeEnv = NodeFS.readFileSync(NodePath.join(stateDir, "saved-environments.json"));

      const result = reencryptSafeStorageSecrets({ stateDir, join: NodePath.join, current });

      assert.equal(result.safeStorage, "verified");
      assert.isFalse(result.reencrypted);
      assert.equal(result.decryptedCurrent, 2);
      assert.equal(result.decryptedLegacy, 0);
      assert.isUndefined(result.warning);
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json")),
        beforeCatalog,
      );
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "saved-environments.json")),
        beforeEnv,
      );
      assert.isFalse(
        NodeFS.existsSync(
          `${NodePath.join(stateDir, "connection-catalog.json")}${SAFE_STORAGE_BACKUP_SUFFIX}`,
        ),
      );
    } finally {
      cleanup();
    }
  });

  it("re-encrypts under the current identity when only the legacy backend can decrypt, keeps a backup, and never deletes the original bytes", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current = makeBackend("new");
      const legacy = makeBackend("old");
      writeCatalog(stateDir, "old", "catalog-secret");
      writeEnvironments(stateDir, [{ id: "env-1", prefix: "old", plaintext: "bearer-1" }]);
      const beforeCatalog = NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"));
      const beforeEnv = NodeFS.readFileSync(NodePath.join(stateDir, "saved-environments.json"));

      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current,
        legacy,
      });

      assert.equal(result.safeStorage, "reencrypted");
      assert.isTrue(result.reencrypted);
      assert.equal(result.decryptedLegacy, 2);
      assert.equal(result.decryptedCurrent, 0);
      assert.isUndefined(result.warning);
      assert.equal(readCatalogPlaintext(stateDir, current), "catalog-secret");
      assert.isUndefined(readCatalogPlaintext(stateDir, legacy));
      const catalogBackup = `${NodePath.join(stateDir, "connection-catalog.json")}${SAFE_STORAGE_BACKUP_SUFFIX}`;
      const envBackup = `${NodePath.join(stateDir, "saved-environments.json")}${SAFE_STORAGE_BACKUP_SUFFIX}`;
      assert.deepEqual(NodeFS.readFileSync(catalogBackup), beforeCatalog);
      assert.deepEqual(NodeFS.readFileSync(envBackup), beforeEnv);
    } finally {
      cleanup();
    }
  });

  it("fails safe, leaves files untouched, and records a re-sign-in warning when neither identity can decrypt", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current = makeBackend("new");
      const legacy = makeBackend("old");
      writeCatalog(stateDir, "other", "catalog-secret");
      const before = NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"));

      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current,
        legacy,
      });

      assert.equal(result.safeStorage, "failed");
      assert.isFalse(result.reencrypted);
      assert.equal(result.warning, SAFE_STORAGE_SIGN_IN_WARNING);
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json")),
        before,
      );
      assert.isFalse(
        NodeFS.existsSync(
          `${NodePath.join(stateDir, "connection-catalog.json")}${SAFE_STORAGE_BACKUP_SUFFIX}`,
        ),
      );
    } finally {
      cleanup();
    }
  });

  it("fails safe when encryption is not available", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      writeCatalog(stateDir, "old", "catalog-secret");
      const before = NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"));
      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current: unavailableBackend,
        legacy: makeBackend("old"),
      });
      assert.equal(result.safeStorage, "unavailable");
      assert.equal(result.warning, SAFE_STORAGE_SIGN_IN_WARNING);
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json")),
        before,
      );
    } finally {
      cleanup();
    }
  });

  it("fails safe and does not replace the working file when a re-encrypt round-trip does not match", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current: SafeStorageBackend = {
        isEncryptionAvailable: () => true,
        encryptString: (value) => new Uint8Array(Buffer.from(`new:${value}`, "utf8")),
        decryptString: (value) => {
          const text = Buffer.from(value).toString("utf8");
          // The current identity cannot read the old ciphertext; a fresh
          // encrypt appears to succeed but does not round-trip.
          if (text.startsWith("new:")) return "tampered";
          return undefined;
        },
      };
      const legacy = makeBackend("old");
      writeCatalog(stateDir, "old", "catalog-secret");
      const before = NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json"));

      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current,
        legacy,
      });

      assert.equal(result.safeStorage, "failed");
      assert.isFalse(result.reencrypted);
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "connection-catalog.json")),
        before,
      );
    } finally {
      cleanup();
    }
  });

  it("verifies a canary round-trip when there are no encrypted payloads", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current: makeBackend("new"),
      });
      assert.equal(result.safeStorage, "verified");
      assert.isFalse(result.reencrypted);
      assert.isUndefined(result.warning);
    } finally {
      cleanup();
    }
  });

  it("fails the canary when the current identity cannot round-trip and there are no payloads", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current: SafeStorageBackend = {
        isEncryptionAvailable: () => true,
        encryptString: (value) => new Uint8Array(Buffer.from(`new:${value}`, "utf8")),
        decryptString: () => "tampered",
      };
      const result = reencryptSafeStorageSecrets({ stateDir, join: NodePath.join, current });
      assert.equal(result.safeStorage, "unavailable");
      assert.equal(result.warning, SAFE_STORAGE_SIGN_IN_WARNING);
    } finally {
      cleanup();
    }
  });

  it("does not write a file when one saved-environment token cannot be decrypted", () => {
    const { stateDir, cleanup } = makeTree();
    try {
      const current = makeBackend("new");
      const legacy = makeBackend("old");
      writeEnvironments(stateDir, [
        { id: "ok", prefix: "old", plaintext: "a" },
        { id: "bad", prefix: "other", plaintext: "b" },
      ]);
      const before = NodeFS.readFileSync(NodePath.join(stateDir, "saved-environments.json"));
      const result = reencryptSafeStorageSecrets({
        stateDir,
        join: NodePath.join,
        current,
        legacy,
      });
      assert.equal(result.safeStorage, "failed");
      assert.deepEqual(
        NodeFS.readFileSync(NodePath.join(stateDir, "saved-environments.json")),
        before,
      );
    } finally {
      cleanup();
    }
  });
});

describe("finalizeSafeStorageMigration", () => {
  it("runs when the profile copy left a pending status, writes the result, and skips a later verified pass", () => {
    const { homeDir, stateDir, profileDir, cleanup } = makeTree();
    try {
      NodeFS.mkdirSync(profileDir, { recursive: true });
      writeMigrationStatus(
        homeDir,
        { at: "t0", profile: "ok", safeStorage: "pending" },
        NodePath.join,
      );
      writeMigrationStatus(
        profileDir,
        { at: "t0", profile: "ok", safeStorage: "pending" },
        NodePath.join,
      );
      writeCatalog(stateDir, "old", "catalog-secret");

      const first = finalizeSafeStorageMigration({
        stateDir,
        homeDir,
        profileDir,
        join: NodePath.join,
        platform: "darwin",
        current: makeBackend("new"),
        legacy: makeBackend("old"),
        now: "t1",
      });
      assert.equal(first.safeStorage, "reencrypted");
      assert.equal(readMigrationStatus(homeDir, NodePath.join)?.safeStorage, "reencrypted");
      assert.equal(readMigrationStatus(profileDir, NodePath.join)?.safeStorage, "reencrypted");
      assert.isUndefined(migrationWarningForUser(readMigrationStatus(homeDir, NodePath.join)));

      const second = finalizeSafeStorageMigration({
        stateDir,
        homeDir,
        profileDir,
        join: NodePath.join,
        platform: "darwin",
        current: makeBackend("new"),
        legacy: makeBackend("old"),
        now: "t2",
      });
      assert.equal(second.safeStorage, "reencrypted");
      assert.isFalse(second.reencrypted);
      assert.equal(readMigrationStatus(homeDir, NodePath.join)?.at, "t1");
    } finally {
      cleanup();
    }
  });

  it("does not throw when the backend throws, and records a re-sign-in warning", () => {
    const { homeDir, stateDir, profileDir, cleanup } = makeTree();
    try {
      NodeFS.mkdirSync(profileDir, { recursive: true });
      writeMigrationStatus(
        homeDir,
        { at: "t0", profile: "ok", safeStorage: "pending" },
        NodePath.join,
      );
      writeCatalog(stateDir, "old", "catalog-secret");
      const current: SafeStorageBackend = {
        isEncryptionAvailable: () => {
          throw new Error("boom");
        },
        encryptString: () => undefined,
        decryptString: () => undefined,
      };
      const result = finalizeSafeStorageMigration({
        stateDir,
        homeDir,
        profileDir,
        join: NodePath.join,
        platform: "darwin",
        current,
        now: "t1",
      });
      assert.equal(result.safeStorage, "failed");
      assert.equal(result.warning, SAFE_STORAGE_SIGN_IN_WARNING);
      assert.equal(readMigrationStatus(homeDir, NodePath.join)?.safeStorage, "failed");
    } finally {
      cleanup();
    }
  });

  it("records a visible re-sign-in warning when re-encryption is impossible, and markSafeStorageWarningShown is sticky", () => {
    const { homeDir, stateDir, profileDir, cleanup } = makeTree();
    try {
      NodeFS.mkdirSync(profileDir, { recursive: true });
      writeMigrationStatus(
        homeDir,
        { at: "t0", profile: "ok", safeStorage: "pending" },
        NodePath.join,
      );
      writeCatalog(stateDir, "other", "catalog-secret");

      const result = finalizeSafeStorageMigration({
        stateDir,
        homeDir,
        profileDir,
        join: NodePath.join,
        platform: "darwin",
        current: makeBackend("new"),
        now: "t1",
      });
      assert.equal(result.safeStorage, "failed");
      const status = readMigrationStatus(homeDir, NodePath.join);
      assert.equal(migrationWarningForUser(status), SAFE_STORAGE_SIGN_IN_WARNING);
      assert.isNotTrue(status?.warningShown);
      markSafeStorageWarningShown(homeDir, profileDir, NodePath.join);
      assert.isTrue(readMigrationStatus(homeDir, NodePath.join)?.warningShown);
    } finally {
      cleanup();
    }
  });
});

describe("needsSafeStorageVerification", () => {
  it("runs for unverified copies and previous crypto failures, not for a failed file copy or a finished verify", () => {
    assert.isTrue(needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "pending" }));
    assert.isTrue(
      needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "windows-local-state" }),
    );
    assert.isTrue(needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "copied" }));
    assert.isTrue(needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "failed" }));
    assert.isFalse(
      needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "verified" }),
    );
    assert.isFalse(
      needsSafeStorageVerification({ at: "t", profile: "ok", safeStorage: "reencrypted" }),
    );
    assert.isFalse(
      needsSafeStorageVerification({ at: "t", profile: "verify-failed", safeStorage: "unknown" }),
    );
    assert.isFalse(needsSafeStorageVerification(undefined));
  });

  it("presents the sign-in warning only until it has been shown", () => {
    assert.isTrue(
      shouldPresentSignInWarning({
        safeStorage: "failed",
        warning: SAFE_STORAGE_SIGN_IN_WARNING,
        reencrypted: false,
        decryptedCurrent: 0,
        decryptedLegacy: 0,
      }),
    );
    assert.isFalse(
      shouldPresentSignInWarning({
        safeStorage: "failed",
        warning: SAFE_STORAGE_SIGN_IN_WARNING,
        warningShown: true,
        reencrypted: false,
        decryptedCurrent: 0,
        decryptedLegacy: 0,
      }),
    );
    assert.isFalse(
      shouldPresentSignInWarning({
        safeStorage: "verified",
        reencrypted: false,
        decryptedCurrent: 1,
        decryptedLegacy: 0,
      }),
    );
  });
});

describe("migrateNexiProfile and safeStorage", () => {
  it("leaves a pending safeStorage status after a macOS profile copy, without a sign-in warning until verification runs", () => {
    const { homeDir, sourceProfile, profileDir, cleanup } = makeTree();
    try {
      NodeFS.mkdirSync(NodePath.join(homeDir, "userdata"), { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(homeDir, "userdata", "statev2.sqlite"),
        Buffer.alloc(64 * 1024, 1),
      );
      writeNexiIdentityMarker(homeDir, { product: "nexi-work" }, NodePath.join);
      NodeFS.mkdirSync(sourceProfile, { recursive: true });
      NodeFS.writeFileSync(sourceProfile + "/Local State", '{"os_crypt":{"encrypted_key":"k"}}');

      const copied = migrateNexiProfile({
        sourceProfileDir: sourceProfile,
        destinationProfileDir: profileDir,
        join: NodePath.join,
        stamp: "testcase",
        adjacentNexiHome: homeDir,
        platform: "darwin",
      });
      assert.equal(copied.status, "ok");
      assert.equal(copied.safeStorage, "pending");
      assert.isUndefined(migrationWarningForUser(readMigrationStatus(profileDir, NodePath.join)));
      assert.isTrue(NodeFS.existsSync(NodePath.join(sourceProfile, "Local State")));
    } finally {
      cleanup();
    }
  });
});
