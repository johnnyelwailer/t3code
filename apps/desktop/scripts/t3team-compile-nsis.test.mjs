/**
 * Compile t3team-installer.nsh the way electron-builder does: once as the
 * installer and once with BUILD_UNINSTALLER, both with warnings as errors
 * (`makensis -WX`). An unused un.StrStr is warning 6010 and failed the
 * rc.22 Windows installer (hive/nx-nexi run 414188077).
 *
 * The installer identity is unchanged: no /D, APP_ID stays ch.nexplore.nexi.work.
 * When makensis is missing, the static check still runs; set
 * T3TEAM_NSIS_REQUIRE_MAKENSIS=1 (fork CI) to require a real compile.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const NSH_PATH = join(SCRIPT_DIR, "..", "resources", "t3team-installer.nsh");
const NEXI_APP_ID = "ch.nexplore.nexi.work";
const REQUIRE_MAKENSIS = process.env.T3TEAM_NSIS_REQUIRE_MAKENSIS === "1";

/** @param {string} source */
export function unusedUninstallStrFuncDeclarations(source) {
  const blockMatch = source.match(/!ifdef BUILD_UNINSTALLER\r?\n([\s\S]*?)!else/);
  if (!blockMatch) {
    return { declared: [], unused: [], used: [], missingBlock: true };
  }
  const block = blockMatch[1];
  const declared = [...block.matchAll(/^\s*\$\{(Un[A-Za-z0-9]+)\}\s*$/gm)].map(
    (m) => m[1],
  );
  const aliases = new Map();
  for (const m of block.matchAll(/!define\s+(\S+)\s+'\$\{(Un[A-Za-z0-9]+)\}'/g)) {
    aliases.set(m[1], m[2]);
  }

  const macros = new Map();
  for (const m of source.matchAll(/!macro\s+(\S+)[^\n]*\r?\n([\s\S]*?)!macroend/g)) {
    macros.set(m[1], m[2]);
  }
  const unFunctions = new Map();
  for (const m of source.matchAll(/Function\s+(un\.\S+)[^\n]*\r?\n([\s\S]*?)FunctionEnd/gi)) {
    unFunctions.set(m[1], m[2]);
  }

  const reachable = new Set();
  const queue = ["customUnInstall", ...unFunctions.keys()];
  while (queue.length > 0) {
    const name = queue.pop();
    if (reachable.has(name)) continue;
    reachable.add(name);
    const body = macros.get(name) ?? unFunctions.get(name);
    if (!body) continue;
    for (const insert of body.matchAll(/!insertmacro\s+(\S+)/g)) {
      queue.push(insert[1]);
    }
  }

  const used = new Set();
  for (const name of reachable) {
    const body = macros.get(name) ?? unFunctions.get(name) ?? "";
    for (const ref of body.matchAll(/\$\{([A-Za-z0-9]+)\}/g)) {
      if (declared.includes(ref[1])) used.add(ref[1]);
      const aliased = aliases.get(ref[1]);
      if (aliased) used.add(aliased);
    }
  }

  return {
    declared,
    used: [...used],
    unused: declared.filter((name) => !used.has(name)),
    missingBlock: false,
  };
}

function findMakensis() {
  const candidate = process.env.MAKENSIS || "makensis";
  const result = spawnSync(candidate, ["-VERSION"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") return null;
  return candidate;
}

/**
 * @param {{ uninstaller: boolean, outFile: string, nshDir: string }} opts
 */
function harnessSource({ uninstaller, outFile, nshDir }) {
  const unDefine = uninstaller ? "!define BUILD_UNINSTALLER\n" : "";
  const installBody = uninstaller
    ? `  WriteUninstaller "$OUTDIR\\uninstaller.exe"`
    : `  !insertmacro customInstall\n  !insertmacro customAppRunningMessages`;
  const uninstallSection = uninstaller
    ? `
Section "Uninstall"
  !insertmacro customUnInstall
SectionEnd
`
    : "";
  const vars = uninstaller
    ? ""
    : `
Var IsPowerShellAvailable
Var PowerShellPath
Var appRunningMessage
Var appClosingMessage
Var appCannotBeClosedMessage
Var newStartMenuLink
Var appExe

Function .onInit
  StrCpy $IsPowerShellAvailable 0
  StrCpy $PowerShellPath "powershell.exe"
  StrCpy $appRunningMessage "running"
  StrCpy $appClosingMessage "closing"
  StrCpy $appCannotBeClosedMessage "cannot"
  StrCpy $newStartMenuLink "x"
  StrCpy $appExe "nexi-work.exe"
FunctionEnd
`;

  return `Unicode True
${unDefine}!addincludedir "${nshDir.replaceAll("\\", "/")}"
!include "LogicLib.nsh"

!define APP_DESCRIPTION "Nexi Work"
!define APP_ID "${NEXI_APP_ID}"
!define PRODUCT_NAME "Nexi Work"
!define DO_NOT_CREATE_START_MENU_SHORTCUT
${vars}
!include "t3team-installer.nsh"

Name "Nexi Work"
OutFile "${outFile.replaceAll("\\", "/")}"
InstallDir "$LOCALAPPDATA\\Programs\\nexi-work"
RequestExecutionLevel user

Section "Install"
${installBody}
SectionEnd
${uninstallSection}`;
}

/**
 * @param {string} nshPath
 * @param {boolean} uninstaller
 */
export function compileInstallerInclude(nshPath, uninstaller) {
  const makensis = findMakensis();
  if (!makensis) {
    return { skipped: true, reason: "makensis not on PATH" };
  }
  const dir = mkdtempSync(join(tmpdir(), "t3team-nsis-"));
  const outFile = join(dir, uninstaller ? "uninstaller-pass.exe" : "installer-pass.exe");
  const scriptPath = join(dir, uninstaller ? "uninstaller.nsi" : "installer.nsi");
  writeFileSync(
    scriptPath,
    harnessSource({ uninstaller, outFile, nshDir: dirname(nshPath) }),
  );
  const args = ["-WX", "-V2", scriptPath];
  assert.equal(
    args.some((arg) => arg.toUpperCase().startsWith("/D")),
    false,
    "the compile harness must never pass NSIS /D",
  );
  const result = spawnSync(makensis, args, { encoding: "utf8", cwd: dir });
  return {
    skipped: false,
    dir,
    args,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
    outFile,
  };
}

function formatCompileOutput(result) {
  return [result.stdout, result.stderr, result.error?.message]
    .filter(Boolean)
    .join("\n");
}

test("the uninstaller does not declare an unused Un* StrFunc macro (rc.22 warning 6010)", () => {
  assert.ok(existsSync(NSH_PATH), `missing ${NSH_PATH}`);
  const source = readFileSync(NSH_PATH, "utf8");
  const { unused, declared, missingBlock } = unusedUninstallStrFuncDeclarations(source);
  assert.equal(missingBlock, false, "expected a BUILD_UNINSTALLER block");
  assert.deepEqual(declared, ["UnStrRep"]);
  assert.deepEqual(unused, []);
});

test("the static check fails on the rc.22 unused un.StrStr declaration", () => {
  const fixture = `
!ifdef BUILD_UNINSTALLER
  \${UnStrRep}
  \${UnStrStr}
  !define T3StrRep '\${UnStrRep}'
  !define T3StrStr '\${UnStrStr}'
!else
!endif
!macro customUnInstall
  \${T3StrRep} $R2 $R1 ";x" ""
!macroend
`;
  const { unused, declared } = unusedUninstallStrFuncDeclarations(fixture);
  assert.deepEqual(declared, ["UnStrRep", "UnStrStr"]);
  assert.deepEqual(unused, ["UnStrStr"]);
});

test("the include keeps the isolated Nexi identity and never mentions NSIS /D as a switch", () => {
  const source = readFileSync(NSH_PATH, "utf8");
  assert.match(source, /ch\.nexplore\.nexi\.work/);
  assert.match(source, /Never pass \/D/);
  assert.match(source, /%LOCALAPPDATA%\\Programs\\nexi-work/);
});

test("makensis -WX compiles the installer and uninstaller passes", (t) => {
  const makensis = findMakensis();
  if (!makensis) {
    if (REQUIRE_MAKENSIS) {
      assert.fail("makensis is required (T3TEAM_NSIS_REQUIRE_MAKENSIS=1) but was not found");
    }
    t.skip("makensis not on PATH");
    return;
  }

  const dirs = [];
  try {
    for (const uninstaller of [false, true]) {
      const label = uninstaller ? "BUILD_UNINSTALLER" : "installer";
      const result = compileInstallerInclude(NSH_PATH, uninstaller);
      if (result.dir) dirs.push(result.dir);
      const output = formatCompileOutput(result);
      assert.equal(
        result.status,
        0,
        `${label} pass failed (exit ${result.status}):\n${output}`,
      );
      assert.doesNotMatch(
        output,
        /warning 6010/,
        `${label} pass emitted warning 6010:\n${output}`,
      );
      assert.equal(existsSync(result.outFile), true, `${label} did not write ${result.outFile}`);
    }
  } finally {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
