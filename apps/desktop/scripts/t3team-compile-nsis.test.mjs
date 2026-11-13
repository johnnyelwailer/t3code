/**
 * Compile t3team-installer.nsh with makensis -WX. Unused un.StrStr is warning 6010.
 * No /D; APP_ID stays ch.nexplore.nexi.work.
 */
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

const SCRIPT_DIR = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const NSH_PATH = NodePath.join(SCRIPT_DIR, "..", "resources", "t3team-installer.nsh");
const NEXI_APP_ID = "ch.nexplore.nexi.work";
const REQUIRE_MAKENSIS = process.env.T3TEAM_NSIS_REQUIRE_MAKENSIS === "1";

/** @param {string} source */
export function unusedUninstallStrFuncDeclarations(source) {
  const blockMatch = source.match(/!ifdef BUILD_UNINSTALLER\r?\n([\s\S]*?)!else/);
  if (!blockMatch) {
    return { declared: [], unused: [], used: [], missingBlock: true };
  }
  const block = blockMatch[1];
  const declared = [...block.matchAll(/^\s*\$\{(Un[A-Za-z0-9]+)\}\s*$/gm)].map((m) => m[1]);
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
  const result = NodeChildProcess.spawnSync(candidate, ["-VERSION"], { encoding: "utf8" });
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
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-nsis-"));
  const outFile = NodePath.join(dir, uninstaller ? "uninstaller-pass.exe" : "installer-pass.exe");
  const scriptPath = NodePath.join(dir, uninstaller ? "uninstaller.nsi" : "installer.nsi");
  NodeFS.writeFileSync(
    scriptPath,
    harnessSource({ uninstaller, outFile, nshDir: NodePath.dirname(nshPath) }),
  );
  const args = ["-WX", "-V2", scriptPath];
  NodeAssert.equal(
    args.some((arg) => arg.toUpperCase().startsWith("/D")),
    false,
    "the compile harness must never pass NSIS /D",
  );
  const result = NodeChildProcess.spawnSync(makensis, args, { encoding: "utf8", cwd: dir });
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
  return [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
}

NodeTest.test(
  "the uninstaller does not declare an unused Un* StrFunc macro (rc.22 warning 6010)",
  () => {
    NodeAssert.ok(NodeFS.existsSync(NSH_PATH), `missing ${NSH_PATH}`);
    const source = NodeFS.readFileSync(NSH_PATH, "utf8");
    const { unused, declared, missingBlock } = unusedUninstallStrFuncDeclarations(source);
    NodeAssert.equal(missingBlock, false, "expected a BUILD_UNINSTALLER block");
    NodeAssert.deepEqual(declared, ["UnStrRep"]);
    NodeAssert.deepEqual(unused, []);
  },
);

NodeTest.test("the static check fails on the rc.22 unused un.StrStr declaration", () => {
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
  NodeAssert.deepEqual(declared, ["UnStrRep", "UnStrStr"]);
  NodeAssert.deepEqual(unused, ["UnStrStr"]);
});

NodeTest.test(
  "the include keeps the isolated Nexi identity and never mentions NSIS /D as a switch",
  () => {
    const source = NodeFS.readFileSync(NSH_PATH, "utf8");
    NodeAssert.match(source, /ch\.nexplore\.nexi\.work/);
    NodeAssert.match(source, /Never pass \/D/);
    NodeAssert.match(source, /%LOCALAPPDATA%\\Programs\\nexi-work/);
  },
);

NodeTest.test("makensis -WX compiles the installer and uninstaller passes", (t) => {
  const makensis = findMakensis();
  if (!makensis) {
    if (REQUIRE_MAKENSIS) {
      NodeAssert.fail("makensis is required (T3TEAM_NSIS_REQUIRE_MAKENSIS=1) but was not found");
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
      NodeAssert.equal(
        result.status,
        0,
        `${label} pass failed (exit ${result.status}):\n${output}`,
      );
      NodeAssert.doesNotMatch(
        output,
        /warning 6010/,
        `${label} pass emitted warning 6010:\n${output}`,
      );
      NodeAssert.equal(
        NodeFS.existsSync(result.outFile),
        true,
        `${label} did not write ${result.outFile}`,
      );
    }
  } finally {
    for (const dir of dirs) {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  }
});
