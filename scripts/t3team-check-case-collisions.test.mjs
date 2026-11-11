import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  findCaseCollisions,
  findStemCollisions,
  findCaseMismatchedImports,
  formatReport,
  fold,
  parseAllowlist,
  rejectAllowed,
  run,
} from "./t3team-check-case-collisions.mjs";

describe("findCaseCollisions", () => {
  it("returns nothing for a clean tree", () => {
    assert.deepEqual(
      findCaseCollisions([
        "apps/web/src/t3team-cloudQueuedSendProviderEnsure.ts",
        "apps/web/src/t3team-CloudQueuedSendProviderEnsureGate.tsx",
      ]),
      [],
    );
  });

  it("does not treat Ensure.tsx vs ensure.ts as a full-path collision (extensions differ)", () => {
    assert.deepEqual(
      findCaseCollisions([
        "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
        "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
      ]),
      [],
    );
  });

  it("folds Unicode with NFC so composed and decomposed names collide", () => {
    const nfc = "cafe\u0301.ts"; // e + combining acute (NFD-ish name stored as-is)
    const other = "café.ts".normalize("NFC");
    // fold() NFC-normalizes then lower-cases, so these share a key only if both NFC to the same string.
    assert.equal(fold("Café.ts"), fold("café.ts"));
    const collisions = findCaseCollisions(["Dir/Readme.md", "dir/README.md"]);
    assert.deepEqual(collisions, [["Dir/Readme.md", "dir/README.md"]]);
    void nfc;
    void other;
  });
});

describe("findStemCollisions", () => {
  it("groups the #879 pair (Ensure.tsx vs ensure.ts in the same directory)", () => {
    const collisions = findStemCollisions([
      "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
      "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
      "apps/web/src/components/t3team-CloudQueuedSendFlusher.tsx",
    ]);
    assert.deepEqual(collisions, [
      [
        "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
        "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
      ],
    ]);
  });

  it("leaves foo.ts next to foo.tsx (same stem case) alone", () => {
    assert.deepEqual(findStemCollisions(["src/foo.ts", "src/foo.tsx"]), []);
  });

  it("does not group files in different directories", () => {
    assert.deepEqual(findStemCollisions(["src/Foo.ts", "lib/foo.ts"]), []);
  });

  it("ignores a .tsx next to a .css of the same stem", () => {
    assert.deepEqual(
      findStemCollisions([
        "apps/web/src/components/files/PdfViewer.tsx",
        "apps/web/src/components/files/pdfViewer.css",
      ]),
      [],
    );
  });

  it("ignores module pairs under .repos/ at any depth", () => {
    assert.deepEqual(
      findStemCollisions([
        ".repos/alchemy-effect/packages/frontend-frameworks/src/nextjs/Runner.ts",
        ".repos/alchemy-effect/packages/frontend-frameworks/src/nextjs/runner.mjs",
        "vendor/t3code/.repos/alchemy-effect/packages/frontend-frameworks/src/nextjs/Runner.ts",
        "vendor/t3code/.repos/alchemy-effect/packages/frontend-frameworks/src/nextjs/runner.mjs",
      ]),
      [],
    );
  });
});

describe("findCaseMismatchedImports", () => {
  const files = (entries) => Object.keys(entries);
  const reader = (entries) => (path) => entries[path];

  it("accepts a specifier that matches the tracked path exactly", () => {
    const entries = {
      "src/a.ts": `import { x } from "./foo";\n`,
      "src/foo.ts": `export const x = 1;\n`,
    };
    assert.deepEqual(findCaseMismatchedImports(files(entries), reader(entries)), []);
  });

  it("flags a specifier whose case differs from the only tracked file", () => {
    const entries = {
      "src/a.ts": `import { x } from "./Foo";\n`,
      "src/foo.ts": `export const x = 1;\n`,
    };
    const findings = findCaseMismatchedImports(files(entries), reader(entries));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].specifier, "./Foo");
    assert.deepEqual(findings[0].tracked, ["src/foo.ts"]);
    assert.equal(findings[0].line, 1);
  });

  it("flags an import that case-insensitively matches two files (the #879 class)", () => {
    const entries = {
      "src/t3team-CloudQueuedSendFlusher.tsx": `import { CloudQueuedSendProviderEnsure } from "./t3team-CloudQueuedSendProviderEnsure";\n`,
      "src/t3team-CloudQueuedSendProviderEnsure.tsx": `export function CloudQueuedSendProviderEnsure() {}\n`,
      "src/t3team-cloudQueuedSendProviderEnsure.ts": `export function ensure() {}\n`,
    };
    const findings = findCaseMismatchedImports(files(entries), reader(entries));
    assert.equal(findings.length, 1);
    assert.equal(findings[0].specifier, "./t3team-CloudQueuedSendProviderEnsure");
    assert.deepEqual(findings[0].tracked, [
      "src/t3team-CloudQueuedSendProviderEnsure.tsx",
      "src/t3team-cloudQueuedSendProviderEnsure.ts",
    ]);
  });

  it("skips files under .repos/", () => {
    const entries = {
      ".repos/example/src/a.ts": `import "./Foo";\n`,
      ".repos/example/src/foo.ts": `export {};\n`,
    };
    assert.deepEqual(findCaseMismatchedImports(files(entries), reader(entries)), []);
  });
});

function isCaseSensitiveFs() {
  const dir = mkdtempSync(join(tmpdir(), "casefs-"));
  try {
    writeFileSync(join(dir, "A"), "a");
    writeFileSync(join(dir, "a"), "b");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function git(cwd, args, opts = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", ...opts });
  assert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(" ")}`);
  return result.stdout;
}

describe("run() against a real git tree", () => {
  it("exits 0 on a clean repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "casecheck-clean-"));
    try {
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "casecheck@example.test"]);
      git(dir, ["config", "user.name", "casecheck"]);
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src/foo.ts"), `export const x = 1;\n`);
      writeFileSync(join(dir, "src/a.ts"), `import { x } from "./foo";\n`);
      git(dir, ["add", "."]);
      git(dir, ["commit", "-m", "clean"]);
      const lines = [];
      const code = run(["--imports"], {
        cwd: dir,
        log: { log: (s) => lines.push(s), error: (s) => lines.push(s) },
      });
      assert.equal(code, 0, lines.join("\n"));
      assert.match(lines.join("\n"), /no case-insensitive collisions/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 when two tracked paths differ only by case (synthetic #879 pair)", function () {
    if (!isCaseSensitiveFs()) {
      this.skip();
    }
    const dir = mkdtempSync(join(tmpdir(), "casecheck-collide-"));
    try {
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "casecheck@example.test"]);
      git(dir, ["config", "user.name", "casecheck"]);
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "src/t3team-cloudQueuedSendProviderEnsure.ts"),
        "export function ensure() {}\n",
      );
      writeFileSync(
        join(dir, "src/t3team-CloudQueuedSendProviderEnsure.tsx"),
        "export function CloudQueuedSendProviderEnsure() {}\n",
      );
      git(dir, ["add", "."]);
      git(dir, ["commit", "-m", "collision"]);
      const lines = [];
      const code = run([], {
        cwd: dir,
        log: { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) },
      });
      const out = lines.join("\n");
      assert.equal(code, 1, out);
      assert.match(out, /t3team-CloudQueuedSendProviderEnsure\.tsx/);
      assert.match(out, /t3team-cloudQueuedSendProviderEnsure\.ts/);
      assert.match(out, /extensionless-name collision/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 when a relative import specifier differs only in case", () => {
    const dir = mkdtempSync(join(tmpdir(), "casecheck-import-"));
    try {
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "casecheck@example.test"]);
      git(dir, ["config", "user.name", "casecheck"]);
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src/foo.ts"), "export const x = 1;\n");
      writeFileSync(join(dir, "src/a.ts"), `import { x } from "./Foo";\n`);
      git(dir, ["add", "."]);
      git(dir, ["commit", "-m", "bad import case"]);
      const lines = [];
      const code = run(["--imports"], {
        cwd: dir,
        log: { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) },
      });
      const out = lines.join("\n");
      assert.equal(code, 1, out);
      assert.match(out, /import specifier case/);
      assert.match(out, /\.\/Foo/);
      assert.match(out, /src\/foo\.ts/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("formatReport", () => {
  it("names both colliding paths", () => {
    const text = formatReport({
      collisions: [["src/A.ts", "src/a.ts"]],
      stems: [],
      imports: [],
    });
    assert.match(text, /src\/A\.ts/);
    assert.match(text, /src\/a\.ts/);
  });
});

describe("allowlist", () => {
  it("suppresses a fully allowlisted stem group but not a group with a new sibling", () => {
    const known = [
      "vendor/t3code/apps/web/src/t3team/t3team-ProjectDashboardKanbanCollapse.test.tsx",
      "vendor/t3code/apps/web/src/t3team/t3team-projectDashboardKanbanCollapse.test.ts",
    ];
    const allow = parseAllowlist(`# comment\n${known[0]}\n${known[1]}\n`);
    assert.deepEqual(rejectAllowed([known], allow), []);
    const wider = [
      ...known,
      "vendor/t3code/apps/web/src/t3team/t3team-PROJECTDashboardKanbanCollapse.test.mts",
    ];
    assert.deepEqual(rejectAllowed([wider], allow), [wider]);
  });
});
