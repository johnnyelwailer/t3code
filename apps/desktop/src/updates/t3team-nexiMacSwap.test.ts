// @effect-diagnostics nodeBuiltinImport:off - drives the real swap helper and the real ditto/plutil on a temp tree.
/**
 * The macOS bundle swap, run for real on a temp tree with a fake app bundle (a shell script as its
 * executable) and a stub launcher. Skipped off macOS, where ditto and plutil do not exist.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { NexiMacUpdater, appBundleOf, stagedBundle } from "./t3team-nexiMacUpdater.ts";
import { NEXI_MAC_SWAP_SCRIPT } from "./t3team-nexiMacSwapScript.ts";

// oxlint-disable-next-line t3code/no-global-process-runtime -- decides at collection time whether macOS-only tools exist.
const mac = NodeOS.platform() === "darwin";
const roots: string[] = [];
const spawned: number[] = [];
afterEach(() => {
  for (const pid of spawned.splice(0)) {
    try {
      process.kill(pid);
    } catch {
      // already gone
    }
  }
  for (const root of roots.splice(0)) NodeFS.rmSync(root, { recursive: true, force: true });
});

const sh = (text: string, mode = 0o755) => ({ text, mode });

function makeApp(dir: string, name: string, version: string, executable: string) {
  const app = NodePath.join(dir, name);
  NodeFS.mkdirSync(NodePath.join(app, "Contents/MacOS"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(app, "Contents/Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.t3tools.t3code</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`,
  );
  NodeFS.writeFileSync(NodePath.join(app, "Contents/MacOS/NexiWork"), executable, { mode: 0o755 });
  return app;
}
const version = (app: string) =>
  NodeFS.readFileSync(NodePath.join(app, "Contents/Info.plist"), "utf8").match(
    /ShortVersionString<\/key><string>([^<]+)</u,
  )?.[1];

/** A launcher stub: logs its arguments, then starts the fake app the way `open -n` would. */
function makeLauncher(dir: string, mode: "starts" | "crashes" | "never") {
  const callsFile = NodePath.join(dir, "launcher-calls.txt");
  const pidFile = NodePath.join(dir, "launched.pid");
  const launcher = NodePath.join(dir, "launcher.sh");
  const start =
    mode === "never"
      ? ""
      : mode === "crashes"
        ? `"$2/Contents/MacOS/NexiWork" crash >/dev/null 2>&1 &`
        : `"$2/Contents/MacOS/NexiWork" run >/dev/null 2>&1 & echo $! >>'${pidFile}'`;
  NodeFS.writeFileSync(
    launcher,
    `#!/bin/bash\necho "$1 $(basename "$2") v$(plutil -extract CFBundleShortVersionString raw -o - "$2/Contents/Info.plist")" >>'${callsFile}'\n${start}\n`,
    { mode: 0o755 },
  );
  return {
    launcher,
    calls: () =>
      NodeFS.existsSync(callsFile) ? NodeFS.readFileSync(callsFile, "utf8").trim().split("\n") : [],
    pids: () =>
      NodeFS.existsSync(pidFile)
        ? NodeFS.readFileSync(pidFile, "utf8").trim().split("\n").map(Number)
        : [],
  };
}
const FAKE_EXECUTABLE = `#!/bin/bash\nif [ "$1" = crash ]; then exit 1; fi\nsleep 30\n`;

function scenario(newLaunch: "starts" | "crashes" | "never") {
  const root = NodeFS.realpathSync(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-swap-")),
  );
  roots.push(root);
  const apps = NodePath.join(root, "Apps");
  NodeFS.mkdirSync(apps);
  const app = makeApp(apps, "Nexi Work.app", "0.1.2-test.1", FAKE_EXECUTABLE);
  const stage = NodePath.join(apps, ".Nexi Work.app.update-1");
  NodeFS.mkdirSync(stage);
  const staged = makeApp(stage, "Nexi Work.app", "0.1.2-test.2", FAKE_EXECUTABLE);
  const backup = `${app}.nexi-backup`;
  const log = NodePath.join(root, "swap.log");
  const launcher = makeLauncher(root, newLaunch);
  const dead = NodeChildProcess.spawnSync("/usr/bin/true");
  const deadPid = String(dead.pid ?? 999999);
  const helper = NodePath.join(root, "swap.sh");
  NodeFS.writeFileSync(helper, NEXI_MAC_SWAP_SCRIPT, { mode: 0o700 });
  const run = (
    over: { pid?: string; backup?: string; stage?: string } = {},
    env: Record<string, string> = {},
  ) => {
    const result = NodeChildProcess.spawnSync(
      "/bin/bash",
      [
        helper,
        over.pid ?? deadPid,
        staged,
        app,
        over.backup ?? backup,
        over.stage ?? stage,
        log,
        launcher.launcher,
      ],
      {
        env: {
          ...process.env,
          NEXI_SWAP_SETTLE: "1",
          NEXI_SWAP_WAIT_LAUNCH: "3",
          NEXI_SWAP_WAIT_EXIT: "1",
          ...env,
        },
        encoding: "utf8",
      },
    );
    spawned.push(...launcher.pids());
    return result;
  };
  return {
    app,
    apps,
    backup,
    stage,
    log,
    launcher,
    run,
    logText: () => (NodeFS.existsSync(log) ? NodeFS.readFileSync(log, "utf8") : ""),
  };
}

describe.skipIf(!mac)("the macOS swap helper", () => {
  it("puts the new app where the old one was, relaunches it there, and removes the backup and staging only after it is running", () => {
    const s = scenario("starts");
    const result = s.run();
    expect(result.status, result.stderr).toBe(0);
    expect(version(s.app)).toBe("0.1.2-test.2");
    expect(NodeFS.existsSync(s.backup)).toBe(false);
    expect(NodeFS.existsSync(s.stage)).toBe(false);
    expect(s.launcher.calls()).toEqual(["-n Nexi Work.app v0.1.2-test.2"]);
    expect(s.logText()).toContain("the new app is running; removing the backup");
  });

  it("rolls back to the old app, relaunches it and deletes the failed bundle when the new app crashes", () => {
    const s = scenario("crashes");
    const result = s.run();
    expect(result.status).toBe(1);
    expect(version(s.app)).toBe("0.1.2-test.1");
    expect(NodeFS.existsSync(s.backup)).toBe(false);
    expect(NodeFS.existsSync(s.stage)).toBe(false);
    expect(s.launcher.calls()).toEqual([
      "-n Nexi Work.app v0.1.2-test.2",
      "-n Nexi Work.app v0.1.2-test.1",
    ]);
    expect(s.logText()).toContain("restoring the previous version");
  });

  it("rolls back when the new app never starts", () => {
    const s = scenario("never");
    expect(s.run({}, { NEXI_SWAP_WAIT_LAUNCH: "1" }).status).toBe(1);
    expect(version(s.app)).toBe("0.1.2-test.1");
    expect(s.launcher.calls()).toHaveLength(2);
  });

  it("changes nothing when the old app does not exit: no swap, no relaunch", () => {
    const s = scenario("starts");
    const alive = NodeChildProcess.spawn("/bin/sleep", ["30"], { stdio: "ignore" });
    spawned.push(alive.pid ?? 0);
    const result = s.run({ pid: String(alive.pid) });
    expect(result.status).toBe(1);
    expect(version(s.app)).toBe("0.1.2-test.1");
    expect(NodeFS.existsSync(s.backup)).toBe(false);
    expect(s.launcher.calls()).toEqual([]);
    expect(s.logText()).toContain("did not exit");
  });

  it("refuses to move or delete anything outside the shapes the app names", () => {
    const s = scenario("starts");
    const victim = NodePath.join(s.apps, "Precious.app");
    NodeFS.mkdirSync(victim);
    const wrongBackup = s.run({ backup: victim });
    expect(wrongBackup.status).toBe(2);
    const wrongStage = s.run({ stage: s.apps });
    expect(wrongStage.status).toBe(2);
    expect(NodeFS.existsSync(victim)).toBe(true);
    expect(version(s.app)).toBe("0.1.2-test.1");
    expect(s.launcher.calls()).toEqual([]);
  });
});

describe.skipIf(!mac)("NexiMacUpdater staging", () => {
  function zipOf(dir: string, app: string) {
    const zip = NodePath.join(dir, "update.zip");
    NodeChildProcess.execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, zip]);
    return zip;
  }
  function install(newVersion: string, expected: string, over: Partial<{ id: boolean }> = {}) {
    const root = NodeFS.realpathSync(
      NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-stage-")),
    );
    roots.push(root);
    const apps = NodePath.join(root, "Apps");
    NodeFS.mkdirSync(apps);
    const running = makeApp(apps, "Nexi Work.app", "0.1.2-test.1", FAKE_EXECUTABLE);
    const built = makeApp(
      NodePath.join(root, "build"),
      "Nexi Work.app",
      newVersion,
      FAKE_EXECUTABLE,
    );
    if (over.id === false) {
      const plist = NodePath.join(built, "Contents/Info.plist");
      NodeFS.writeFileSync(
        plist,
        NodeFS.readFileSync(plist, "utf8").replace("com.t3tools.t3code", "com.someone.else"),
      );
    }
    const zip = zipOf(root, built);
    const helperCalls: string[][] = [];
    const errors: Error[] = [];
    class TestUpdater extends NexiMacUpdater {
      protected override get installerPath() {
        return zip;
      }
      protected override dispatchError(error: Error) {
        errors.push(error);
      }
    }
    const updater = new TestUpdater({
      appBundlePath: running,
      logFile: NodePath.join(root, "logs/swap.log"),
      launcher: "/usr/bin/true",
      app: { version: "0.1.2-test.1", name: "Nexi Work" },
      spawnHelper: (args) => helperCalls.push([...args]),
    });
    (updater as unknown as { updateInfoAndProvider: unknown }).updateInfoAndProvider = {
      info: { version: expected },
    };
    const ok = (updater as unknown as { doInstall(): boolean }).doInstall();
    return { ok, helperCalls, errors, apps, running };
  }

  it("unpacks next to the app, checks it, and hands the swap helper exact paths", () => {
    const r = install("0.1.2-test.2", "0.1.2-test.2");
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    const [, pid, staged, app, backup, stage, , launcher] = r.helperCalls[0] ?? [];
    expect(pid).toBe(String(process.pid));
    expect(app).toBe(r.running);
    expect(backup).toBe(`${r.running}.nexi-backup`);
    expect(NodePath.dirname(stage ?? "")).toBe(r.apps);
    expect(staged).toBe(NodePath.join(stage ?? "", "Nexi Work.app"));
    expect(version(staged ?? "")).toBe("0.1.2-test.2");
    expect(launcher).toBe("/usr/bin/true");
    expect(version(r.running)).toBe("0.1.2-test.1");
  });

  it("refuses an update whose version is not the one announced, or that is another app, and starts no helper", () => {
    const wrongVersion = install("0.1.2-test.9", "0.1.2-test.2");
    expect(wrongVersion.ok).toBe(false);
    expect(wrongVersion.helperCalls).toEqual([]);
    expect(wrongVersion.errors[0]?.message).toMatch(
      /version is not the version the release announced/u,
    );
    expect(
      NodeFS.readdirSync(wrongVersion.apps).filter((name) => name.includes(".update-")),
    ).toEqual([]);
    const otherApp = install("0.1.2-test.2", "0.1.2-test.2", { id: false });
    expect(otherApp.ok).toBe(false);
    expect(otherApp.errors[0]?.message).toMatch(/different app/u);
    expect(version(otherApp.running)).toBe("0.1.2-test.1");
  });

  it("finds the running bundle from the executable path", () => {
    expect(appBundleOf("/Applications/Nexi Work.app/Contents/MacOS/Nexi Work")).toBe(
      "/Applications/Nexi Work.app",
    );
    expect(appBundleOf("/usr/local/bin/node")).toBeNull();
  });

  it("stagedBundle needs exactly one app in the archive", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nexi-staged-"));
    roots.push(dir);
    expect(() => stagedBundle(dir, dir, "1.0.0")).toThrow(/exactly one app/u);
  });
});

void sh;
