// @effect-diagnostics nodeBuiltinImport:off - guard tests use a temp home and a retry signal, no clocks.
import { assert, describe, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { runHomeGuard, SHARED_HOME_LOCK_HELD_BY_RUNNING_SERVER, type HomeGuardSession, type OldAppGuardState } from "./t3team-oldAppGuard.ts";
import { detectOldApp, detectOldAppSync } from "./t3team-oldAppPresence.ts";
import { inspectOwnershipLock } from "./t3team-oldAppLock.ts";
import { serverOwnerLockPath, serverRuntimeStatePath } from "./t3team-oldAppPaths.ts";
import { parseSingletonLockTarget, inspectElectronSingletonLock } from "./t3team-oldAppElectronLock.ts";
import {
  OLD_APP_GUARD_ERROR,
  OLD_APP_GUARD_MESSAGE,
  OLD_APP_GUARD_RETRY,
  buildOldAppGuardHtml,
} from "./t3team-oldAppGuardScreen.ts";
import { isRetryHash } from "../window/t3team-oldAppGuardWindow.ts";
import { migrateNexiHome } from "./t3team-homeMigration.ts";

const makeTree = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "old-app-guard-"));
  const home = NodePath.join(root, "nexi-work");
  NodeFS.mkdirSync(NodePath.join(home, "userdata"), { recursive: true });
  return {
    root,
    home,
    branded: NodePath.join(root, "branded"),
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const writeRuntime = (home: string, pid: number) => {
  NodeFS.writeFileSync(
    serverRuntimeStatePath(home, NodePath.join),
    `${JSON.stringify({
      version: 1,
      pid,
      port: 3773,
      origin: "http://127.0.0.1:3773",
      startedAt: "2026-01-01T00:00:00.000Z",
    })}\n`,
  );
};

const holdLock = (home: string) => {
  const lockPath = serverOwnerLockPath(home, NodePath.join);
  const db = new NodeSqlite.DatabaseSync(lockPath);
  db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE;");
  return {
    release: () => {
      try {
        db.exec("ROLLBACK;");
      } catch {
        // closed
      }
      db.close();
    },
  };
};

type Controller = {
  readonly session: HomeGuardSession;
  readonly states: OldAppGuardState[];
  readonly retry: () => void;
  readonly presented: Promise<void>;
  readonly waitFor: (state: OldAppGuardState) => Promise<void>;
};

const createController = (): Controller => {
  const states: OldAppGuardState[] = [];
  const waiters = new Map<OldAppGuardState, Array<() => void>>();
  let signal: (() => void) | undefined;
  let presentedResolve: (() => void) | undefined;
  const presented = new Promise<void>((resolve) => {
    presentedResolve = resolve;
  });
  const notify = (state: OldAppGuardState) => {
    const pending = waiters.get(state) ?? [];
    waiters.delete(state);
    for (const done of pending) done();
  };
  const session: HomeGuardSession = {
    setState: (state) => {
      states.push(state);
      notify(state);
    },
    waitForRetry: () =>
      new Promise<void>((resolve) => {
        presentedResolve?.();
        presentedResolve = undefined;
        signal = resolve;
      }),
  };
  return {
    session,
    states,
    presented,
    retry: () => {
      const next = signal;
      signal = undefined;
      if (!next) throw new Error("retry before the screen was waiting");
      next();
    },
    waitFor: (state) =>
      new Promise<void>((resolve) => {
        if (states.at(-1) === state) {
          resolve();
          return;
        }
        const list = waiters.get(state) ?? [];
        list.push(resolve);
        waiters.set(state, list);
      }),
  };
};

describe("runHomeGuard", () => {
  it("starts normally on a fresh home and calls migrate once", async () => {
    const tree = makeTree();
    try {
      let migrateCalls = 0;
      let presentCalled = false;
      const result = await runHomeGuard({
        detect: () => detectOldApp({ homes: [tree.home], join: NodePath.join, skipPort: true }),
        migrate: () => {
          migrateCalls += 1;
        },
        present: () => {
          presentCalled = true;
          return createController().session;
        },
      });
      assert.equal(result.waitedForOldApp, false);
      assert.equal(migrateCalls, 1);
      assert.equal(presentCalled, false);
    } finally {
      tree.cleanup();
    }
  });

  it("shows the screen and does not call migrate while the old app is detected", async () => {
    const tree = makeTree();
    try {
      const held = holdLock(tree.home);
      writeRuntime(tree.home, 99);
      let migrateCalls = 0;
      let takeoverCalls = 0;
      const migrate = () => {
        migrateCalls += 1;
        takeoverCalls += 1;
        migrateNexiHome({
          legacyDir: NodePath.join(tree.root, ".t3"),
          brandedDir: tree.branded,
          join: NodePath.join,
          stamp: "test",
        });
      };
      const live = { value: true };
      const ui = createController();
      const presence = () => {
        const found = detectOldAppSync({
          homes: [tree.home],
          join: NodePath.join,
          isAlive: (pid) => live.value && pid === 99,
        });
        // The lock is an independent signal; drop it when the test "quits" the old app.
        if (!live.value) {
          return { ...found, running: false, signals: [] };
        }
        return found;
      };
      assert.equal(detectOldAppSync({
        homes: [tree.home],
        join: NodePath.join,
        isAlive: () => true,
      }).running, true);

      const done = runHomeGuard({
        detect: presence,
        migrate,
        present: () => ui.session,
      });
      await ui.presented;
      assert.deepEqual(ui.states, ["blocked"]);
      assert.equal(migrateCalls, 0);
      assert.equal(takeoverCalls, 0);
      assert.equal(NodeFS.existsSync(tree.branded), false);

      ui.retry();
      await ui.waitFor("still-running");
      assert.ok(ui.states.includes("retrying"));
      assert.equal(ui.states.at(-1), "still-running");
      assert.equal(migrateCalls, 0);

      live.value = false;
      held.release();
      ui.retry();
      const result = await done;
      assert.equal(result.waitedForOldApp, true);
      assert.equal(migrateCalls, 1);
      assert.equal(takeoverCalls, 1);
      assert.equal(ui.states.at(-1), "continuing");
    } finally {
      tree.cleanup();
    }
  });

  it("cleans a stale lock after a crash and continues without the screen", async () => {
    const tree = makeTree();
    try {
      writeRuntime(tree.home, 88);
      let migrateCalls = 0;
      const result = await runHomeGuard({
        detect: () =>
          detectOldAppSync({
            homes: [tree.home],
            join: NodePath.join,
            isAlive: () => false,
          }),
        migrate: () => {
          migrateCalls += 1;
        },
        present: () => createController().session,
      });
      assert.equal(result.waitedForOldApp, false);
      assert.equal(result.lastPresence.cleanedStaleRuntime, true);
      assert.equal(migrateCalls, 1);
      assert.equal(NodeFS.existsSync(serverRuntimeStatePath(tree.home, NodePath.join)), false);
      assert.equal(inspectOwnershipLock(serverOwnerLockPath(tree.home, NodePath.join)), "missing");
    } finally {
      tree.cleanup();
    }
  });

  it("treats a lock held by rc.20 as refusing a second server (old app relaunch)", () => {
    const tree = makeTree();
    try {
      const held = holdLock(tree.home);
      try {
        assert.equal(inspectOwnershipLock(serverOwnerLockPath(tree.home, NodePath.join)), "held");
        const presence = detectOldAppSync({
          homes: [tree.home],
          join: NodePath.join,
        });
        assert.equal(presence.running, true);
        assert.ok(presence.signals.includes("ownership-lock"));
        assert.ok(SHARED_HOME_LOCK_HELD_BY_RUNNING_SERVER.includes("server-owner.sqlite"));
      } finally {
        held.release();
      }
      assert.equal(inspectOwnershipLock(serverOwnerLockPath(tree.home, NodePath.join)), "free");
    } finally {
      tree.cleanup();
    }
  });
});

describe("port, Electron lock, and screen copy", () => {
  it("identifies a T3 environment descriptor and ignores an unrelated listener", async () => {
    const identified = await detectOldApp({
      homes: [],
      skipPort: false,
      probePort: async () => ({ kind: "identified", serverVersion: "1.0.0" }),
    });
    assert.equal(identified.running, true);
    assert.ok(identified.signals.includes("backend-port"));
    const other = await detectOldApp({
      homes: [],
      probePort: async () => ({ kind: "other" }),
    });
    assert.equal(other.running, false);
    const quiet = await detectOldApp({
      homes: [],
      probePort: async () => ({ kind: "not-listening" }),
    });
    assert.equal(quiet.running, false);
  });

  it("detects a live Electron SingletonLock and ignores this process or a dead pid", () => {
    const tree = makeTree();
    try {
      const userData = NodePath.join(tree.root, "t3code-v2");
      NodeFS.mkdirSync(userData, { recursive: true });
      const lockPath = NodePath.join(userData, "SingletonLock");
      NodeFS.symlinkSync(`testhost-4242`, lockPath);
      assert.equal(parseSingletonLockTarget("testhost-4242", "testhost"), 4242);
      const live = inspectElectronSingletonLock({
        userDataDir: userData,
        join: NodePath.join,
        hostname: "testhost",
        isAlive: (pid) => pid === 4242,
        selfPids: [process.pid],
      });
      assert.equal(live.running, true);
      const self = inspectElectronSingletonLock({
        userDataDir: userData,
        join: NodePath.join,
        hostname: "testhost",
        isAlive: () => true,
        selfPids: [4242],
      });
      assert.equal(self.running, false);
      const dead = inspectElectronSingletonLock({
        userDataDir: userData,
        join: NodePath.join,
        hostname: "testhost",
        isAlive: () => false,
        selfPids: [process.pid],
      });
      assert.equal(dead.running, false);
    } finally {
      tree.cleanup();
    }
  });

  it("renders the quit-and-retry copy in every state", () => {
    for (const state of ["blocked", "retrying", "still-running", "continuing"] as const) {
      for (const theme of ["light", "dark"] as const) {
        const html = buildOldAppGuardHtml({ state, theme });
        assert.ok(html.includes(OLD_APP_GUARD_MESSAGE));
        assert.ok(html.includes(OLD_APP_GUARD_RETRY) || html.includes("Retrying") || html.includes("Starting"));
        if (state === "still-running") {
          assert.ok(html.includes(OLD_APP_GUARD_ERROR));
          assert.ok(!html.includes('id="error" hidden') && !html.includes('id="error"  hidden'));
        }
        assert.ok(html.includes(`data-state="${state}"`));
        assert.ok(html.includes(`class="${theme}"`));
        assert.ok(html.includes("env(titlebar-area-height"));
      }
    }
    assert.equal(isRetryHash("#retry-1"), true);
    assert.equal(isRetryHash("#other"), false);
  });
});
