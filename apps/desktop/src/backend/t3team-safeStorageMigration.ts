// @effect-diagnostics nodeBuiltinImport:off - safeStorage migration is a synchronous startup step on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  type JoinPath,
  type MigrationStatus,
  SAFE_STORAGE_SIGN_IN_WARNING,
  nowIsoForMigration,
  readMigrationStatus,
  writeMigrationStatus,
} from "./t3team-homeMigration.ts";

/**
 * If this process cannot decrypt safeStorage after an app identity change (on macOS the
 * Keychain item `${app.getName()} Safe Storage` is often ACL-bound to the old bundle id),
 * it does not delete the old data and records a re-sign-in warning. A prior build under
 * the old bundle would have to grant the new bundle Keychain access before the switch.
 */
export const SAFE_STORAGE_BACKUP_SUFFIX = ".pre-identity-migration";

export interface SafeStorageBackend {
  readonly isEncryptionAvailable: () => boolean;
  readonly encryptString: (value: string) => Uint8Array | undefined;
  readonly decryptString: (value: Uint8Array) => string | undefined;
}

export type SafeStorageOutcome =
  | "verified"
  | "reencrypted"
  | "failed"
  | "not-needed"
  | "unavailable";

export interface SafeStorageMigrationResult {
  readonly safeStorage: NonNullable<MigrationStatus["safeStorage"]>;
  readonly warning?: string | undefined;
  readonly warningShown?: boolean | undefined;
  readonly reencrypted: boolean;
  readonly decryptedCurrent: number;
  readonly decryptedLegacy: number;
}

export const shouldPresentSignInWarning = (result: SafeStorageMigrationResult): boolean =>
  Boolean(result.warning) && result.warningShown !== true;

export function needsSafeStorageVerification(status: MigrationStatus | undefined): boolean {
  if (!status) return false;
  if (status.profile === "verify-failed" || status.home === "verify-failed") {
    return false;
  }
  const value = status.safeStorage;
  return (
    value === "pending" ||
    value === "unknown" ||
    value === "windows-local-state" ||
    value === "copied" ||
    value === "failed" ||
    value === "unavailable"
  );
}

function decodeBase64(encoded: string): Uint8Array | undefined {
  try {
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.length === 0 && encoded.length > 0) return undefined;
    return new Uint8Array(buffer);
  } catch {
    return undefined;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function readJsonFile(path: string): unknown | undefined {
  try {
    return JSON.parse(NodeFS.readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decryptPayload(
  ciphertext: Uint8Array,
  current: SafeStorageBackend,
  legacy: SafeStorageBackend | undefined,
): { plaintext: string; via: "current" | "legacy" } | undefined {
  const fromCurrent = current.decryptString(ciphertext);
  if (fromCurrent !== undefined) return { plaintext: fromCurrent, via: "current" };
  if (legacy === undefined) return undefined;
  const fromLegacy = legacy.decryptString(ciphertext);
  if (fromLegacy !== undefined) return { plaintext: fromLegacy, via: "legacy" };
  return undefined;
}

function encryptAndVerify(plaintext: string, current: SafeStorageBackend): Uint8Array | undefined {
  const encrypted = current.encryptString(plaintext);
  if (encrypted === undefined) return undefined;
  const roundTrip = current.decryptString(encrypted);
  if (roundTrip !== plaintext) return undefined;
  return encrypted;
}

type CatalogRewrite = {
  readonly path: string;
  readonly original: Buffer;
  readonly next: string;
  readonly via: ReadonlyArray<"current" | "legacy">;
};

type RewriteResult =
  | { ok: true; rewrite?: CatalogRewrite; via: ReadonlyArray<"current" | "legacy"> }
  | { ok: false };

function rewriteConnectionCatalog(
  path: string,
  current: SafeStorageBackend,
  legacy: SafeStorageBackend | undefined,
): RewriteResult {
  if (!NodeFS.existsSync(path)) return { ok: true, via: [] };
  const original = NodeFS.readFileSync(path);
  const document = readJsonFile(path);
  if (document === undefined) return { ok: false };
  if (!isRecord(document)) return { ok: false };
  if (typeof document.encryptedCatalog !== "string") return { ok: true, via: [] };
  const ciphertext = decodeBase64(document.encryptedCatalog);
  if (ciphertext === undefined) return { ok: false };
  const decrypted = decryptPayload(ciphertext, current, legacy);
  if (decrypted === undefined) return { ok: false };
  if (decrypted.via === "current") {
    return { ok: true, via: ["current"] };
  }
  const encrypted = encryptAndVerify(decrypted.plaintext, current);
  if (encrypted === undefined) return { ok: false };
  const nextDocument = { ...document, encryptedCatalog: encodeBase64(encrypted) };
  return {
    ok: true,
    via: [decrypted.via],
    rewrite: {
      path,
      original,
      next: `${JSON.stringify(nextDocument, null, 2)}\n`,
      via: [decrypted.via],
    },
  };
}

function rewriteSavedEnvironments(
  path: string,
  current: SafeStorageBackend,
  legacy: SafeStorageBackend | undefined,
): RewriteResult {
  if (!NodeFS.existsSync(path)) return { ok: true, via: [] };
  const original = NodeFS.readFileSync(path);
  const document = readJsonFile(path);
  if (document === undefined) return { ok: false };
  if (!isRecord(document)) return { ok: false };
  const records = document.records;
  if (records === undefined) return { ok: true, via: [] };
  if (!Array.isArray(records)) return { ok: false };

  const via: Array<"current" | "legacy"> = [];
  let needsRewrite = false;
  const nextRecords: unknown[] = [];
  for (const record of records) {
    if (!isRecord(record) || typeof record.encryptedBearerToken !== "string") {
      nextRecords.push(record);
      continue;
    }
    const ciphertext = decodeBase64(record.encryptedBearerToken);
    if (ciphertext === undefined) return { ok: false };
    const decrypted = decryptPayload(ciphertext, current, legacy);
    if (decrypted === undefined) return { ok: false };
    via.push(decrypted.via);
    if (decrypted.via === "current") {
      nextRecords.push(record);
      continue;
    }
    const encrypted = encryptAndVerify(decrypted.plaintext, current);
    if (encrypted === undefined) return { ok: false };
    needsRewrite = true;
    nextRecords.push({ ...record, encryptedBearerToken: encodeBase64(encrypted) });
  }
  if (!needsRewrite) return { ok: true, via };
  return {
    ok: true,
    via,
    rewrite: {
      path,
      original,
      next: `${JSON.stringify({ ...document, records: nextRecords }, null, 2)}\n`,
      via,
    },
  };
}

function writeVerifiedRewrite(rewrite: CatalogRewrite): boolean {
  const backupPath = `${rewrite.path}${SAFE_STORAGE_BACKUP_SUFFIX}`;
  const directory = NodePath.dirname(rewrite.path);
  const tempPath = NodePath.join(
    directory,
    `${NodePath.basename(rewrite.path)}.${process.pid}.tmp`,
  );
  try {
    if (!NodeFS.existsSync(backupPath)) {
      NodeFS.writeFileSync(backupPath, rewrite.original, { flag: "wx" });
    }
    NodeFS.writeFileSync(tempPath, rewrite.next, { flag: "w" });
    NodeFS.renameSync(tempPath, rewrite.path);
    return true;
  } catch {
    try {
      if (NodeFS.existsSync(tempPath)) NodeFS.rmSync(tempPath, { force: true });
    } catch {
      // The original working file is still in place if rename did not run.
    }
    return false;
  }
}

function canaryRoundTrip(current: SafeStorageBackend): boolean {
  const canary = "nexi-work-safe-storage-canary";
  const encrypted = current.encryptString(canary);
  if (encrypted === undefined) return false;
  return current.decryptString(encrypted) === canary;
}

export function reencryptSafeStorageSecrets(input: {
  readonly stateDir: string;
  readonly join: JoinPath;
  readonly current: SafeStorageBackend;
  readonly legacy?: SafeStorageBackend;
}): SafeStorageMigrationResult {
  const { stateDir, join, current, legacy } = input;
  const failed = (
    safeStorage: SafeStorageMigrationResult["safeStorage"] = "failed",
  ): SafeStorageMigrationResult => ({
    safeStorage,
    warning: SAFE_STORAGE_SIGN_IN_WARNING,
    reencrypted: false,
    decryptedCurrent: 0,
    decryptedLegacy: 0,
  });

  if (!current.isEncryptionAvailable()) {
    return failed("unavailable");
  }

  const catalogPath = join(stateDir, "connection-catalog.json");
  const environmentsPath = join(stateDir, "saved-environments.json");
  const catalog = rewriteConnectionCatalog(catalogPath, current, legacy);
  if (!catalog.ok) return failed();
  const environments = rewriteSavedEnvironments(environmentsPath, current, legacy);
  if (!environments.ok) return failed();

  const rewrites = [catalog.rewrite, environments.rewrite].filter(
    (rewrite): rewrite is CatalogRewrite => rewrite !== undefined,
  );
  const via = [...catalog.via, ...environments.via];
  const decryptedLegacy = via.filter((item) => item === "legacy").length;
  const decryptedCurrent = via.filter((item) => item === "current").length;

  if (rewrites.length === 0) {
    if (decryptedCurrent === 0 && decryptedLegacy === 0 && !canaryRoundTrip(current)) {
      return failed("unavailable");
    }
    return {
      safeStorage: "verified",
      reencrypted: false,
      decryptedCurrent,
      decryptedLegacy,
    };
  }

  for (const rewrite of rewrites) {
    if (!writeVerifiedRewrite(rewrite)) {
      return failed();
    }
  }

  return {
    safeStorage: "reencrypted",
    reencrypted: true,
    decryptedCurrent,
    decryptedLegacy,
  };
}

export function finalizeSafeStorageMigration(input: {
  readonly stateDir: string;
  readonly homeDir: string;
  readonly profileDir: string;
  readonly join: JoinPath;
  readonly platform: NodeJS.Platform;
  readonly current: SafeStorageBackend;
  readonly legacy?: SafeStorageBackend;
  readonly now?: string;
}): SafeStorageMigrationResult {
  const { stateDir, homeDir, profileDir, join, current, legacy } = input;
  const existing = readMigrationStatus(homeDir, join) ?? readMigrationStatus(profileDir, join);
  if (!needsSafeStorageVerification(existing)) {
    return {
      safeStorage: existing?.safeStorage ?? "not-needed",
      warning: undefined,
      warningShown: existing?.warningShown,
      reencrypted: false,
      decryptedCurrent: 0,
      decryptedLegacy: 0,
    };
  }

  try {
    const result = reencryptSafeStorageSecrets({
      stateDir,
      join,
      current,
      ...(legacy === undefined ? {} : { legacy }),
    });
    const at = input.now ?? nowIsoForMigration();
    const nextStatus: MigrationStatus = {
      ...(existing ?? { at }),
      at,
      safeStorage: result.safeStorage,
      warning: result.warning,
      warningShown: result.warning ? existing?.warningShown : undefined,
    };
    writeMigrationStatus(profileDir, nextStatus, join);
    writeMigrationStatus(homeDir, nextStatus, join);
    return {
      ...result,
      warningShown: nextStatus.warningShown,
    };
  } catch {
    const failed: SafeStorageMigrationResult = {
      safeStorage: "failed",
      warning: SAFE_STORAGE_SIGN_IN_WARNING,
      reencrypted: false,
      decryptedCurrent: 0,
      decryptedLegacy: 0,
    };
    try {
      const at = input.now ?? nowIsoForMigration();
      const nextStatus: MigrationStatus = {
        ...(existing ?? { at }),
        at,
        safeStorage: "failed",
        warning: SAFE_STORAGE_SIGN_IN_WARNING,
      };
      writeMigrationStatus(profileDir, nextStatus, join);
      writeMigrationStatus(homeDir, nextStatus, join);
    } catch {
      // A status write must not hide the fail-safe result.
    }
    return failed;
  }
}

export function markSafeStorageWarningShown(
  homeDir: string,
  profileDir: string,
  join: JoinPath,
): void {
  for (const dir of [homeDir, profileDir]) {
    const existing = readMigrationStatus(dir, join);
    if (!existing?.warning) continue;
    writeMigrationStatus(dir, { ...existing, warningShown: true }, join);
  }
}
