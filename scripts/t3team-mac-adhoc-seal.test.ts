// @effect-diagnostics nodeBuiltinImport:off - the hook under test is a plain CommonJS build hook.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it } from "@effect/vitest";

const require = NodeModule.createRequire(import.meta.url);
const { sealMacAppAdHoc } = require("./t3team-desktop-asar-dts-afterpack-utils.cjs") as {
  sealMacAppAdHoc: (
    context: { appOutDir: string; electronPlatformName: string },
    enabled: boolean,
    run: (command: string, args: ReadonlyArray<string>) => void,
  ) => string | undefined;
};

function appOutDirWith(...apps: ReadonlyArray<string>): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "mac-adhoc-seal-"));
  for (const app of apps) NodeFS.mkdirSync(NodePath.join(dir, app));
  return dir;
}

describe("sealMacAppAdHoc", () => {
  it("seals the one app bundle with a complete ad-hoc signature, then verifies it strictly", () => {
    const appOutDir = appOutDirWith("Nexi Work.app");
    const calls: Array<string> = [];
    const sealed = sealMacAppAdHoc(
      { appOutDir, electronPlatformName: "darwin" },
      true,
      (command, args) => {
        calls.push([command, ...args].join(" "));
      },
    );
    const appPath = NodePath.join(appOutDir, "Nexi Work.app");
    assert.equal(sealed, appPath);
    assert.deepEqual(calls, [
      `/usr/bin/codesign --force --deep --sign - ${appPath}`,
      `/usr/bin/codesign --verify --deep --strict ${appPath}`,
    ]);
  });

  it("leaves a signed build and every other platform alone", () => {
    const appOutDir = appOutDirWith("Nexi Work.app");
    const run = () => assert.fail("codesign must not run");
    assert.equal(
      sealMacAppAdHoc({ appOutDir, electronPlatformName: "darwin" }, false, run),
      undefined,
    );
    assert.equal(
      sealMacAppAdHoc({ appOutDir, electronPlatformName: "win32" }, true, run),
      undefined,
    );
    assert.equal(
      sealMacAppAdHoc({ appOutDir, electronPlatformName: "linux" }, true, run),
      undefined,
    );
  });

  it("fails the build when the bundle is ambiguous or a codesign step fails", () => {
    const run = () => assert.fail("codesign must not run");
    assert.throws(() =>
      sealMacAppAdHoc({ appOutDir: appOutDirWith(), electronPlatformName: "darwin" }, true, run),
    );
    assert.throws(() =>
      sealMacAppAdHoc(
        { appOutDir: appOutDirWith("A.app", "B.app"), electronPlatformName: "darwin" },
        true,
        run,
      ),
    );
    assert.throws(
      () =>
        sealMacAppAdHoc(
          { appOutDir: appOutDirWith("Nexi Work.app"), electronPlatformName: "darwin" },
          true,
          () => {
            throw new Error("codesign failed");
          },
        ),
      /codesign failed/u,
    );
  });
});
