import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
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

NodeTest.describe("findCaseCollisions", () => {
  NodeTest.it("returns nothing for a clean tree", () => {
    NodeAssert.deepEqual(
      findCaseCollisions([
        "apps/web/src/t3team-cloudQueuedSendProviderEnsure.ts",
        "apps/web/src/t3team-CloudQueuedSendProviderEnsureGate.tsx",
      ]),
      [],
    );
  });

  NodeTest.it(
    "does not treat Ensure.tsx vs ensure.ts as a full-path collision (extensions differ)",
    () => {
      NodeAssert.deepEqual(
        findCaseCollisions([
          "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
          "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
        ]),
        [],
      );
    },
  );

  NodeTest.it("folds Unicode with NFC so composed and decomposed names collide", () => {
    const nfc = "cafe\u0301.ts"; // e + combining acute (NFD-ish name stored as-is)
    const other = "café.ts".normalize("NFC");
    // fold() NFC-normalizes then lower-cases, so these share a key only if both NFC to the same string.
    NodeAssert.equal(fold("Café.ts"), fold("café.ts"));
    const collisions = findCaseCollisions(["Dir/Readme.md", "dir/README.md"]);
    NodeAssert.deepEqual(collisions, [["Dir/Readme.md", "dir/README.md"]]);
    void nfc;
    void other;
  });
});

NodeTest.describe("findStemCollisions", () => {
  NodeTest.it("groups the #879 pair (Ensure.tsx vs ensure.ts in the same directory)", () => {
    const collisions = findStemCollisions([
      "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
      "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
      "apps/web/src/components/t3team-CloudQueuedSendFlusher.tsx",
    ]);
    NodeAssert.deepEqual(collisions, [
      [
        "apps/web/src/components/t3team-CloudQueuedSendProviderEnsure.tsx",
        "apps/web/src/components/t3team-cloudQueuedSendProviderEnsure.ts",
      ],
    ]);
  });

  NodeTest.it("leaves foo.ts next to foo.tsx (same stem case) alone", () => {
    NodeAssert.deepEqual(findStemCollisions(["src/foo.ts", "src/foo.tsx"]), []);
  });

  NodeTest.it("does not group files in different directories", () => {
    NodeAssert.deepEqual(findStemCollisions(["src/Foo.ts", "lib/foo.ts"]), []);
  });

  NodeTest.it("ignores a .tsx next to a .css of the same stem", () => {
    NodeAssert.deepEqual(
      findStemCollisions([
        "apps/web/src/components/files/PdfViewer.tsx",
        "apps/web/src/components/files/pdfViewer.css",
      ]),
      [],
    );
  });

  NodeTest.it("ignores module pairs under .repos/ at any depth", () => {
    NodeAssert.deepEqual(
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

NodeTest.describe("findCaseMismatchedImports", () => {
  const files = (entries) => Object.keys(entries);
  const reader = (entries) => (path) => entries[path];

  NodeTest.it("accepts a specifier that matches the tracked path exactly", () => {
    const entries = {
      "src/a.ts": `import { x } from "./foo";\n`,
      "src/foo.ts": `export const x = 1;\n`,
    };
    NodeAssert.deepEqual(findCaseMismatchedImports(files(entries), reader(entries)), []);
  });

  NodeTest.it("flags a specifier whose case differs from the only tracked file", () => {
    const entries = {
      "src/a.ts": `import { x } from "./Foo";\n`,
      "src/foo.ts": `export const x = 1;\n`,
    };
    const findings = findCaseMismatchedImports(files(entries), reader(entries));
    NodeAssert.equal(findings.length, 1);
    NodeAssert.equal(findings[0].specifier, "./Foo");
    NodeAssert.deepEqual(findings[0].tracked, ["src/foo.ts"]);
    NodeAssert.equal(findings[0].line, 1);
  });

  NodeTest.it("flags an import that case-insensitively matches two files (the #879 class)", () => {
    const entries = {
      "src/t3team-CloudQueuedSendFlusher.tsx": `import { CloudQueuedSendProviderEnsure } from "./t3team-CloudQueuedSendProviderEnsure";\n`,
      "src/t3team-CloudQueuedSendProviderEnsure.tsx": `export function CloudQueuedSendProviderEnsure() {}\n`,
      "src/t3team-cloudQueuedSendProviderEnsure.ts": `export function ensure() {}\n`,
    };
    const findings = findCaseMismatchedImports(files(entries), reader(entries));
    NodeAssert.equal(findings.length, 1);
    NodeAssert.equal(findings[0].specifier, "./t3team-CloudQueuedSendProviderEnsure");
    NodeAssert.deepEqual(findings[0].tracked, [
      "src/t3team-CloudQueuedSendProviderEnsure.tsx",
      "src/t3team-cloudQueuedSendProviderEnsure.ts",
    ]);
  });

  NodeTest.it("skips files under .repos/", () => {
    const entries = {
      ".repos/example/src/a.ts": `import "./Foo";\n`,
      ".repos/example/src/foo.ts": `export {};\n`,
    };
    NodeAssert.deepEqual(findCaseMismatchedImports(files(entries), reader(entries)), []);
  });
});

function isCaseSensitiveFs() {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "casefs-"));
  try {
    NodeFS.writeFileSync(NodePath.join(dir, "A"), "a");
    NodeFS.writeFileSync(NodePath.join(dir, "a"), "b");
    return true;
  } catch {
    return false;
  } finally {
    NodeFS.rmSync(dir, { recursive: true, force: true });
  }
}

function git(cwd, args, opts = {}) {
  const result = NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8", ...opts });
  NodeAssert.equal(result.status, 0, result.stderr || result.stdout || `git ${args.join(" ")}`);
  return result.stdout;
}

NodeTest.describe("run() against a real git tree", () => {
  NodeTest.it("exits 0 on a clean repository", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "casecheck-clean-"));
    try {
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "casecheck@example.test"]);
      git(dir, ["config", "user.name", "casecheck"]);
      NodeFS.mkdirSync(NodePath.join(dir, "src"));
      NodeFS.writeFileSync(NodePath.join(dir, "src/foo.ts"), `export const x = 1;\n`);
      NodeFS.writeFileSync(NodePath.join(dir, "src/a.ts"), `import { x } from "./foo";\n`);
      git(dir, ["add", "."]);
      git(dir, ["commit", "-m", "clean"]);
      const lines = [];
      const code = run(["--imports"], {
        cwd: dir,
        log: { log: (s) => lines.push(s), error: (s) => lines.push(s) },
      });
      NodeAssert.equal(code, 0, lines.join("\n"));
      NodeAssert.match(lines.join("\n"), /no case-insensitive collisions/);
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });

  NodeTest.it(
    "exits 1 when two tracked paths differ only by case (synthetic #879 pair)",
    function () {
      if (!isCaseSensitiveFs()) {
        this.skip();
      }
      const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "casecheck-collide-"));
      try {
        git(dir, ["init"]);
        git(dir, ["config", "user.email", "casecheck@example.test"]);
        git(dir, ["config", "user.name", "casecheck"]);
        NodeFS.mkdirSync(NodePath.join(dir, "src"));
        NodeFS.writeFileSync(
          NodePath.join(dir, "src/t3team-cloudQueuedSendProviderEnsure.ts"),
          "export function ensure() {}\n",
        );
        NodeFS.writeFileSync(
          NodePath.join(dir, "src/t3team-CloudQueuedSendProviderEnsure.tsx"),
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
        NodeAssert.equal(code, 1, out);
        NodeAssert.match(out, /t3team-CloudQueuedSendProviderEnsure\.tsx/);
        NodeAssert.match(out, /t3team-cloudQueuedSendProviderEnsure\.ts/);
        NodeAssert.match(out, /extensionless-name collision/);
      } finally {
        NodeFS.rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  NodeTest.it("exits 1 when a relative import specifier differs only in case", () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "casecheck-import-"));
    try {
      git(dir, ["init"]);
      git(dir, ["config", "user.email", "casecheck@example.test"]);
      git(dir, ["config", "user.name", "casecheck"]);
      NodeFS.mkdirSync(NodePath.join(dir, "src"));
      NodeFS.writeFileSync(NodePath.join(dir, "src/foo.ts"), "export const x = 1;\n");
      NodeFS.writeFileSync(NodePath.join(dir, "src/a.ts"), `import { x } from "./Foo";\n`);
      git(dir, ["add", "."]);
      git(dir, ["commit", "-m", "bad import case"]);
      const lines = [];
      const code = run(["--imports"], {
        cwd: dir,
        log: { log: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) },
      });
      const out = lines.join("\n");
      NodeAssert.equal(code, 1, out);
      NodeAssert.match(out, /import specifier case/);
      NodeAssert.match(out, /\.\/Foo/);
      NodeAssert.match(out, /src\/foo\.ts/);
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  });
});

NodeTest.describe("formatReport", () => {
  NodeTest.it("names both colliding paths", () => {
    const text = formatReport({
      collisions: [["src/A.ts", "src/a.ts"]],
      stems: [],
      imports: [],
    });
    NodeAssert.match(text, /src\/A\.ts/);
    NodeAssert.match(text, /src\/a\.ts/);
  });
});

NodeTest.describe("allowlist", () => {
  NodeTest.it(
    "suppresses a fully allowlisted stem group but not a group with a new sibling",
    () => {
      const known = [
        "vendor/t3code/apps/web/src/t3team/t3team-ProjectDashboardKanbanCollapse.test.tsx",
        "vendor/t3code/apps/web/src/t3team/t3team-projectDashboardKanbanCollapse.test.ts",
      ];
      const allow = parseAllowlist(`# comment\n${known[0]}\n${known[1]}\n`);
      NodeAssert.deepEqual(rejectAllowed([known], allow), []);
      const wider = [
        ...known,
        "vendor/t3code/apps/web/src/t3team/t3team-PROJECTDashboardKanbanCollapse.test.mts",
      ];
      NodeAssert.deepEqual(rejectAllowed([wider], allow), [wider]);
    },
  );
});
