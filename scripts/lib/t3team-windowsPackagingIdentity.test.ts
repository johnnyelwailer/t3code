// @effect-diagnostics nodeBuiltinImport:off - reads the NSIS include from disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { assert, describe, it } from "@effect/vitest";

import { DEFAULT_DESKTOP_APP_ID } from "./t3team-releaseFlavor.ts";
import { LIVE_NEXI_APP_ID } from "./t3team-isolatedInstanceEnv.ts";
import {
  ELECTRON_BUILDER_NSIS_GUID_NAMESPACE,
  NEXI_INSTALL_DIR_NAME,
  NEXI_LIVE_NSIS_GUID,
  NEXI_NSIS_INCLUDE,
  NEXI_WINDOWS_EXECUTABLE_NAME,
  NEXI_WINDOWS_PACKAGE_NAME,
  NEXI_WINDOWS_PUBLISHER,
  UPSTREAM_INSTALL_DIR_NAME,
  UPSTREAM_NSIS_GUID,
  UPSTREAM_NSIS_INCLUDE,
  UPSTREAM_WINDOWS_PACKAGE_NAME,
  UPSTREAM_WINDOWS_PUBLISHER,
  electronBuilderNsisGuid,
  isStaleNexiUninstallEntry,
  overlapsUpstreamWindowsIdentity,
  protocolSchemesOf,
  resolveWindowsPackagingIdentity,
  windowsNsisOptions,
  windowsPackagedExecutableFileName,
} from "./t3team-windowsPackagingIdentity.ts";

const isolatedEnv = {
  T3CODE_DESKTOP_ISOLATED_INSTANCE: "1",
  T3CODE_DESKTOP_APP_ID: LIVE_NEXI_APP_ID,
  T3CODE_DESKTOP_PRODUCT_NAME: "Nexi Work",
};

describe("electronBuilderNsisGuid", () => {
  it("matches electron-builder's v5 GUID for upstream and live Nexi", () => {
    assert.equal(ELECTRON_BUILDER_NSIS_GUID_NAMESPACE, "50e065bc-3134-11e6-9bab-38c9862bdaf3");
    assert.equal(electronBuilderNsisGuid(DEFAULT_DESKTOP_APP_ID), UPSTREAM_NSIS_GUID);
    assert.equal(UPSTREAM_NSIS_GUID, "e9197887-efb3-55e0-985e-d6d3b5dd594a");
    assert.equal(electronBuilderNsisGuid(LIVE_NEXI_APP_ID), NEXI_LIVE_NSIS_GUID);
    assert.equal(NEXI_LIVE_NSIS_GUID, "d7645905-3717-5f1a-a0a2-35a881dffd02");
    assert.notEqual(UPSTREAM_NSIS_GUID, NEXI_LIVE_NSIS_GUID);
  });
});

describe("resolveWindowsPackagingIdentity", () => {
  it("keeps the historical upstream identity when the build is not isolated", () => {
    const upstream = resolveWindowsPackagingIdentity({ env: {} });
    assert.equal(upstream.isolated, false);
    assert.equal(upstream.appId, DEFAULT_DESKTOP_APP_ID);
    assert.equal(upstream.packageName, UPSTREAM_WINDOWS_PACKAGE_NAME);
    assert.equal(upstream.installDirName, UPSTREAM_INSTALL_DIR_NAME);
    assert.equal(upstream.executableName, undefined);
    assert.equal(upstream.publisher, UPSTREAM_WINDOWS_PUBLISHER);
    assert.equal(upstream.guid, UPSTREAM_NSIS_GUID);
    assert.equal(upstream.nsisInclude, UPSTREAM_NSIS_INCLUDE);
    assert.deepEqual(protocolSchemesOf(upstream), ["t3code", "t3code-dev"]);
    assert.deepEqual(windowsNsisOptions(upstream), {
      differentialPackage: true,
      include: UPSTREAM_NSIS_INCLUDE,
    });
  });

  it("gives an isolated Nexi build its own dir, exe, GUID, publisher, and nexi-work:// only", () => {
    const isolated = resolveWindowsPackagingIdentity({
      env: isolatedEnv,
      appId: LIVE_NEXI_APP_ID,
      productName: "Nexi Work",
    });
    assert.equal(isolated.isolated, true);
    assert.equal(isolated.packageName, NEXI_WINDOWS_PACKAGE_NAME);
    assert.equal(isolated.installDirName, NEXI_INSTALL_DIR_NAME);
    assert.equal(isolated.executableName, NEXI_WINDOWS_EXECUTABLE_NAME);
    assert.equal(isolated.publisher, NEXI_WINDOWS_PUBLISHER);
    assert.equal(isolated.displayName, "Nexi Work");
    assert.equal(isolated.guid, NEXI_LIVE_NSIS_GUID);
    assert.equal(isolated.nsisInclude, NEXI_NSIS_INCLUDE);
    assert.deepEqual(protocolSchemesOf(isolated), ["nexi-work"]);
    assert.isFalse(protocolSchemesOf(isolated).includes("t3code"));
    assert.deepEqual(overlapsUpstreamWindowsIdentity(isolated), []);
    const nsis = windowsNsisOptions(isolated);
    assert.equal(nsis.guid, NEXI_LIVE_NSIS_GUID);
    assert.equal(nsis.uninstallDisplayName, "Nexi Work");
    assert.equal(nsis.shortcutName, "Nexi Work");
    assert.equal(nsis.include, NEXI_NSIS_INCLUDE);
    assert.notEqual(isolated.guid, UPSTREAM_NSIS_GUID);
    assert.notEqual(isolated.packageName, UPSTREAM_WINDOWS_PACKAGE_NAME);
  });

  it("a replace/unisolated flavored product name does not change the builder NSIS block", () => {
    const plain = windowsNsisOptions(resolveWindowsPackagingIdentity({ env: {} }));
    const replace = windowsNsisOptions(
      resolveWindowsPackagingIdentity({
        env: {
          T3CODE_DESKTOP_PRODUCT_NAME: "Nexi Work",
          T3CODE_DESKTOP_APP_ID: LIVE_NEXI_APP_ID,
        },
        appId: LIVE_NEXI_APP_ID,
        productName: "Nexi Work",
      }),
    );
    // Replace is not isolated: same install dir/GUID machinery as upstream
    // would collide, but the NSIS *options object* (differentialPackage +
    // historical include, no extra keys) stays byte-identical.
    assert.deepEqual(replace, plain);
    assert.deepEqual(replace, {
      differentialPackage: true,
      include: UPSTREAM_NSIS_INCLUDE,
    });
  });
});

describe("isStaleNexiUninstallEntry", () => {
  it("accepts only a positively identified Nexi Work entry, never T3 Code", () => {
    assert.isTrue(
      isStaleNexiUninstallEntry({
        displayName: "Nexi Work",
        publisher: "Nexplore",
        installLocation: "C:\\Users\\p\\AppData\\Local\\Programs\\t3code",
      }),
    );
    assert.isFalse(
      isStaleNexiUninstallEntry({
        displayName: "T3 Code",
        publisher: "T3 Tools",
        installLocation: "C:\\Users\\p\\AppData\\Local\\Programs\\t3code",
      }),
    );
    assert.isFalse(
      isStaleNexiUninstallEntry({
        displayName: "T3 Code (Beta)",
        publisher: "Nexplore",
        installLocation: "C:\\Users\\p\\AppData\\Local\\Programs\\t3code",
      }),
    );
    assert.isFalse(
      isStaleNexiUninstallEntry({
        displayName: "Nexi Work",
        publisher: "T3 Tools",
      }),
    );
    assert.isFalse(isStaleNexiUninstallEntry({ displayName: "Nexi Work" }));
    assert.isFalse(isStaleNexiUninstallEntry({}));
  });
});

describe("the isolated NSIS include", () => {
  it("cleans only a positively identified Nexi uninstall key and never deletes Programs\\t3code", () => {
    const repo = NodePath.join(NodeURL.fileURLToPath(new URL(".", import.meta.url)), "../..");
    const body = NodeFS.readFileSync(NodePath.join(repo, NEXI_NSIS_INCLUDE), "utf8");
    assert.include(body, UPSTREAM_NSIS_GUID);
    assert.include(body, "Nexi Work");
    assert.include(body, "Nexplore");
    assert.include(body, "T3 Code");
    assert.include(body, "nexi.cmd");
    assert.include(body, "Environment");
    assert.notMatch(body, /^\s*RMDir\b/m);
    assert.notInclude(body, "RMDir /r");
    assert.notInclude(body, "Programs\\t3code");
    assert.notMatch(body, /\/D=/u);
    assert.include(body, "Never pass /D");
    assert.include(body, "createMenuDirectory");
    assert.include(body, "T3TEAM_STALE_NEXI_GUID");
    assert.include(body, "DeleteRegKey");
    assert.notInclude(body, "RMDir /r");
  });
});

describe("windowsPackagedExecutableFileName", () => {
  it("uses nexi-work.exe for an isolated Nexi build, not the 'Nexi Work' display name", () => {
    const isolated = resolveWindowsPackagingIdentity({
      env: isolatedEnv,
      appId: LIVE_NEXI_APP_ID,
      productName: "Nexi Work",
    });
    assert.equal(windowsPackagedExecutableFileName(isolated, "Nexi Work"), "nexi-work.exe");
    assert.notEqual(windowsPackagedExecutableFileName(isolated, "Nexi Work"), "Nexi Work.exe");
  });

  it("falls back to the product name when the build is not isolated", () => {
    const upstream = resolveWindowsPackagingIdentity({ env: {} });
    assert.equal(windowsPackagedExecutableFileName(upstream, "T3 Code"), "T3 Code.exe");
    const replace = resolveWindowsPackagingIdentity({
      env: {
        T3CODE_DESKTOP_PRODUCT_NAME: "Nexi Work",
        T3CODE_DESKTOP_APP_ID: LIVE_NEXI_APP_ID,
      },
      appId: LIVE_NEXI_APP_ID,
      productName: "Nexi Work",
    });
    assert.equal(replace.executableName, undefined);
    assert.equal(windowsPackagedExecutableFileName(replace, "Nexi Work"), "Nexi Work.exe");
  });
});
