// @effect-diagnostics nodeBuiltinImport:off - lock tests hold a real SQLite exclusive transaction on a temp home.
import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeSqlite from "node:sqlite";

import { inspectHomeLock, inspectOwnershipLock, readRuntimeState } from "./t3team-oldAppLock.ts";
import { serverOwnerLockPath, serverRuntimeStatePath } from "./t3team-oldAppPaths.ts";

const makeHome = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "old-app-lock-"));
  const home = NodePath.join(root, "nexi-work");
  NodeFS.mkdirSync(NodePath.join(home, "userdata"), { recursive: true });
  return {
    root,
    home,
    lockPath: serverOwnerLockPath(home, NodePath.join),
    statePath: serverRuntimeStatePath(home, NodePath.join),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const writeRuntime = (statePath: string, pid: number, port = 3773) => {
  NodeFS.writeFileSync(
    statePath,
    JSON.stringify({
      version: 1,
      pid,
      port,
      origin: `http://127.0.0.1:${port}`,
      startedAt: "2026-01-01T00:00:00.000Z",
    }) + "\n",
  );
};

const holdLock = (lockPath: string) => {
  const db = new NodeSqlite.DatabaseSync(lockPath);
  db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
  return {
    release: () => {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // already closed
      }
      db.close();
    },
  };
};

describe("shared home ownership lock", () => {
  it("reports missing, free, and held locks, and ignores this process as the owner", () => {
    const tree = makeHome();
    try {
      assert.equal(inspectOwnershipLock(tree.lockPath), "missing");
      NodeFS.writeFileSync(tree.lockPath, "");
      assert.equal(inspectOwnershipLock(tree.lockPath), "free");
      const held = holdLock(tree.lockPath);
      try {
        assert.equal(inspectOwnershipLock(tree.lockPath), "held");
      } finally {
        held.release();
      }
      assert.equal(inspectOwnershipLock(tree.lockPath), "free");
    } finally {
      tree.cleanup();
    }
  });

  it("treats a dead runtime pid and a free lock as stale and clears the record", () => {
    const tree = makeHome();
    try {
      writeRuntime(tree.statePath, 2_000_000_000);
      const inspection = inspectHomeLock({
        home: tree.home,
        join: NodePath.join,
        selfPids: [process.pid],
        isAlive: () => false,
      });
      assert.equal(inspection.lock, "missing");
      assert.equal(inspection.runtimePidAlive, false);
      assert.equal(inspection.cleanedStaleRuntime, true);
      assert.equal(NodeFS.existsSync(tree.statePath), false);
      assert.equal(readRuntimeState(tree.statePath), undefined);
    } finally {
      tree.cleanup();
    }
  });

  it("does not clear runtime state while the lock is held", () => {
    const tree = makeHome();
    try {
      writeRuntime(tree.statePath, 42);
      const held = holdLock(tree.lockPath);
      try {
        const inspection = inspectHomeLock({
          home: tree.home,
          join: NodePath.join,
          isAlive: (pid) => pid === 42,
        });
        assert.equal(inspection.lock, "held");
        assert.equal(inspection.runtimePidAlive, true);
        assert.equal(inspection.cleanedStaleRuntime, false);
        assert.equal(NodeFS.existsSync(tree.statePath), true);
      } finally {
        held.release();
      }
    } finally {
      tree.cleanup();
    }
  });

  it("sees a lock held by another process and treats a self pid as not the old app", async () => {
    const tree = makeHome();
    try {
      const child = NodeChildProcess.spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import * as NodeSqlite from "node:sqlite";
           const db = new NodeSqlite.DatabaseSync(process.argv[1]);
           db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
           process.stdout.write("ready\\n");
           process.stdin.resume();`,
          tree.lockPath,
        ],
        { stdio: ["pipe", "pipe", "inherit"] },
      );
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.stdout?.on("data", (chunk) => {
          if (String(chunk).includes("ready")) resolve();
        });
        child.once("exit", (code) => reject(new Error(`holder exited ${code}`)));
      });
      try {
        const inspection = inspectHomeLock({
          home: tree.home,
          join: NodePath.join,
          selfPids: [process.pid],
        });
        assert.equal(inspection.lock, "held");
        writeRuntime(tree.statePath, process.pid, 3783);
        const self = inspectHomeLock({
          home: tree.home,
          join: NodePath.join,
          selfPids: [process.pid],
        });
        assert.equal(self.runtimeIsSelf, true);
        assert.equal(self.runtimePidAlive, true);
      } finally {
        child.kill();
        await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      }
    } finally {
      tree.cleanup();
    }
  });
});
