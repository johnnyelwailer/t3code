/**
 * What electron-updater's stock NsisUpdater runs on Windows, captured without running anything:
 * `spawnLog` is the one call that would start the installer, and it is replaced here. The real
 * installer is never executed by this test (a silent install with /D would replace the user's
 * install and repoint their shortcuts); the point is to pin the command line.
 */
import { NsisUpdater } from "electron-updater";
import { describe, expect, it } from "vite-plus/test";

const fakeApp = {
  version: "0.1.2-rc.4",
  name: "Nexi Work",
  isPackaged: true,
  appUpdateConfigPath: "/nonexistent/app-update.yml",
  userDataPath: "/nonexistent/userData",
  baseCachePath: "/nonexistent/cache",
  whenReady: () => Promise.resolve(),
  quit: () => {},
  onQuit: () => {},
  relaunch: () => {},
};

function capture(configure?: (updater: NsisUpdater) => void) {
  const spawned: Array<{ command: string; args: ReadonlyArray<string> }> = [];
  class CapturingNsisUpdater extends NsisUpdater {
    protected override get installerPath() {
      return "C:\\Users\\u\\AppData\\Local\\nexi-work-updater\\pending\\Nexi-Work-0.1.2-rc.5-x64.exe";
    }
    protected override spawnLog(command: string, args: string[] = []) {
      spawned.push({ command, args });
      return Promise.resolve(true);
    }
  }
  const updater = new CapturingNsisUpdater(null, fakeApp as never);
  configure?.(updater);
  const installed = (updater as unknown as { doInstall(o: object): boolean }).doInstall({
    isSilent: true,
    isForceRunAfter: true,
    isAdminRightsRequired: false,
  });
  return { updater, installed, spawned };
}

describe("the Windows install command line", () => {
  it("is `<installer> --updated /S --force-run`: the normal update path, no /D= and no other install directory", () => {
    const { updater, installed, spawned } = capture();
    expect(installed).toBe(true);
    expect(spawned).toEqual([
      {
        command:
          "C:\\Users\\u\\AppData\\Local\\nexi-work-updater\\pending\\Nexi-Work-0.1.2-rc.5-x64.exe",
        args: ["--updated", "/S", "--force-run"],
      },
    ]);
    expect(
      spawned.flatMap((call) => call.args).some((arg) => arg.toUpperCase().startsWith("/D")),
    ).toBe(false);
    expect((updater as unknown as { installDirectory?: string }).installDirectory).toBeUndefined();
  });

  it("would carry /D= only if someone set installDirectory, which nothing in the desktop does", () => {
    const { spawned } = capture((updater) => {
      (updater as unknown as { installDirectory: string }).installDirectory = "C:\\elsewhere";
    });
    expect(spawned[0]?.args).toContain("/D=C:\\elsewhere");
  });
});
