import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "vitest";
import { areaOf, isIgnoredPath, totalsByArea } from "./t3team-placement-areas.mjs";
import {
  parseBaseline,
  parseNameStatus,
  parseNumstat,
  serializeBaseline,
} from "./t3team-placement-footprint.mjs";
import {
  detectUpstreamSync,
  parseRenames,
  runPlacementCheck,
  writePlacementBaseline,
} from "./t3team-placement-guard.mjs";
import { evaluatePlacement, hasBlockingGrowth } from "./t3team-placement-ratchet.mjs";
import { validateSeamRegistry } from "./t3team-placement-registry.mjs";
import {
  candidateUpstreamCounterpartPaths,
  classifyPrefixedLocResult,
} from "./t3team-additive-guard-lib.mjs";
import {
  ADDITIVE_GUARD_BASE_ENV,
  enforceForkBaselineRef,
} from "./scripts/lib/additive-guard-core.mjs";

describe("t3team additive guard counterpart detection", () => {
  it("maps web t3team migration path to project-shell counterpart", () => {
    const result = candidateUpstreamCounterpartPaths(
      "apps/web/src/t3team/hooks/t3team-useCreateProject.ts",
      ["t3team-", "t3team."],
    );

    expect(result).toContain("apps/project-shell/src/hooks/useCreateProject.ts");
    expect(result).toContain("apps/web/src/hooks/useCreateProject.ts");
  });

  it("maps same-directory prefixed file to non-prefixed basename", () => {
    const result = candidateUpstreamCounterpartPaths("apps/server/src/t3team-server.ts", [
      "t3team-",
      "t3team.",
    ]);

    expect(result).toContain("apps/server/src/server.ts");
  });
});

describe("t3team additive guard fork baseline ref policy", () => {
  it("accepts a frozen fork-baseline tag in the namespaced form", () => {
    expect(enforceForkBaselineRef("t3team/fork-baseline-20260908")).toBe(
      "t3team/fork-baseline-20260908",
    );
  });

  it("accepts an optional suffix on the baseline date", () => {
    expect(enforceForkBaselineRef("t3team/fork-baseline-20260908-sync")).toBe(
      "t3team/fork-baseline-20260908-sync",
    );
  });

  it("leaves the blocking base untouched when no baseline is configured", () => {
    expect(enforceForkBaselineRef(undefined)).toBeUndefined();
    expect(enforceForkBaselineRef("")).toBeUndefined();
  });

  it("refuses to repoint the blocking gate at an arbitrary ref", () => {
    for (const bogus of [
      "upstream/main",
      "origin/main",
      "main",
      "HEAD",
      "refs/heads/main",
      "t3team/baseline-20260908",
      "t3team/fork-baseline",
      "https://github.com/pingdotgg/t3code",
    ]) {
      expect(() => enforceForkBaselineRef(bogus)).toThrow(/forkBaselineRef/);
    }
  });

  it("refuses non-string baseline values", () => {
    expect(() => enforceForkBaselineRef({})).toThrow(/forkBaselineRef/);
    expect(() => enforceForkBaselineRef(["t3team/fork-baseline-20260908"])).toThrow(
      /forkBaselineRef/,
    );
  });

  it("exposes the drift-override env var name", () => {
    expect(ADDITIVE_GUARD_BASE_ENV).toBe("T3TEAM_ADDITIVE_GUARD_BASE");
  });
});

describe("t3team additive guard loc classification", () => {
  it("fails oversized net-new prefixed files without counterpart", () => {
    const result = classifyPrefixedLocResult({
      filePath: "apps/web/src/t3team/t3team-NewFeature.tsx",
      loc: 250,
      locWarnThreshold: 150,
      locFailThreshold: 200,
      counterpartPath: null,
    });

    expect(result).toEqual({
      kind: "violation",
      message:
        "Prefixed file exceeds 200 LOC: apps/web/src/t3team/t3team-NewFeature.tsx (250 non-empty lines).",
    });
  });

  it("downgrades oversized migrated wrappers to warning when counterpart exists", () => {
    const result = classifyPrefixedLocResult({
      filePath: "apps/web/src/t3team/hooks/t3team-useCreateProject.ts",
      loc: 250,
      locWarnThreshold: 150,
      locFailThreshold: 200,
      counterpartPath: "apps/project-shell/src/hooks/useCreateProject.ts",
    });

    expect(result?.kind).toBe("warning");
    expect(result?.message).toContain("warning only due to upstream counterpart");
  });

  it("uses higher thresholds for additive test artifacts", () => {
    const result = classifyPrefixedLocResult({
      filePath: "apps/web/src/t3team/t3team-projectDashboardKanbanMatrix.test.ts",
      loc: 500,
      locWarnThreshold: 150,
      locFailThreshold: 200,
      counterpartPath: null,
    });

    expect(result).toEqual({
      kind: "warning",
      message:
        "Prefixed file is above 300 LOC warning threshold: apps/web/src/t3team/t3team-projectDashboardKanbanMatrix.test.ts (500 non-empty lines).",
    });
  });

  it("uses higher thresholds for additive fixture artifacts", () => {
    const result = classifyPrefixedLocResult({
      filePath: "apps/web/src/t3team/t3team-projectDashboardKanbanMatrixFixtures.tsx",
      loc: 550,
      locWarnThreshold: 150,
      locFailThreshold: 200,
      counterpartPath: null,
    });

    expect(result).toEqual({
      kind: "warning",
      message:
        "Prefixed file is above 300 LOC warning threshold: apps/web/src/t3team/t3team-projectDashboardKanbanMatrixFixtures.tsx (550 non-empty lines).",
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Placement ratchet
// ---------------------------------------------------------------------------------------------

const seam = (overrides = {}) => ({
  id: "mobile-start-screen-slot",
  kind: "ui-slot",
  files: ["apps/mobile/src/extensions/StartScreenSlot.tsx"],
  description: "Lets the distribution replace the start screen component.",
  nexiImplementation: "nexi-work/mobile/start-screen",
  owner: "pj",
  maxLoc: 80,
  ...overrides,
});
const registryOf = (...seams) => ({ seams, ignoreGlobs: [], errors: [] });
const item = (path, loc, kind = "file") => ({ path, area: areaOf(path), kind, loc });
const itemsOf = (...list) => new Map(list.map((entry) => [entry.path, entry]));
const baselineOf = (...list) =>
  new Map(list.map((entry) => [entry.path, { area: entry.area, kind: entry.kind, loc: entry.loc }]));
const evaluate = (overrides) =>
  evaluatePlacement({
    items: new Map(),
    baseline: new Map(),
    registry: registryOf(),
    ...overrides,
  });

describe("placement areas and ignores", () => {
  it("classifies paths into the restricted and warn-only areas", () => {
    expect(areaOf("apps/mobile/src/App.tsx")).toBe("apps/mobile/src");
    expect(areaOf("apps/mobile/modules/x/android/X.kt")).toBe("apps/mobile/modules");
    expect(areaOf("apps/mobile/plugins/withX.js")).toBe("apps/mobile/other");
    expect(areaOf("packages/contracts/src/a.ts")).toBe("packages/contracts");
    expect(areaOf("packages/contractsx/src/a.ts")).toBe("other");
    expect(areaOf("apps/web/src/t3team/x.ts")).toBe("apps/web/src");
  });

  it("ignores generated files and the placement files themselves", () => {
    expect(isIgnoredPath("apps/web/src/routeTree.gen.ts")).toBe(true);
    expect(isIgnoredPath("apps/mobile/generated-uniwind-themes.css")).toBe(true);
    expect(isIgnoredPath("packages/contracts/src/__snapshots__/a.snap")).toBe(true);
    expect(isIgnoredPath(".t3team-placement-baseline.jsonl")).toBe(true);
    expect(isIgnoredPath("apps/mobile/src/t3team-real.ts")).toBe(false);
  });

  it("sums added files and edited upstream files separately", () => {
    const totals = totalsByArea([
      item("packages/contracts/src/t3team-a.ts", 10),
      item("packages/contracts/src/ipc.ts", 4, "modified"),
    ]);
    expect(totals["packages/contracts"]).toEqual({ files: 1, loc: 10, modified: 1, addedLines: 4 });
  });
});

describe("placement git output parsing", () => {
  it("parses numstat including binary files and tabs-free paths", () => {
    const rows = parseNumstat("12\t3\ta/b.ts\n-\t-\tassets/x.png\n");
    expect(rows.get("a/b.ts")).toBe(12);
    expect(rows.get("assets/x.png")).toBe(0);
  });

  it("parses name-status and renames", () => {
    expect(parseNameStatus("A\tnew.ts\nM\told.ts").get("new.ts")).toBe("A");
    const renames = parseRenames("R100\tapps/mobile/src/t3team-a.ts\tapps/mobile/src/t3team-b.ts\nA\tz.ts");
    expect(renames.get("apps/mobile/src/t3team-b.ts")).toBe("apps/mobile/src/t3team-a.ts");
    expect(renames.size).toBe(1);
  });
});

describe("placement baseline file", () => {
  it("round-trips, sorted, one entry per line", () => {
    const text = serializeBaseline([
      item("packages/contracts/src/t3team-b.ts", 2),
      item("apps/mobile/src/t3team-a.ts", 1),
    ]);
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("apps/mobile/src/t3team-a.ts");
    const parsed = parseBaseline(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.entries.get("packages/contracts/src/t3team-b.ts")?.loc).toBe(2);
  });

  it("reports merge-conflict markers and duplicate paths instead of guessing", () => {
    expect(parseBaseline("<<<<<<< HEAD\n{}\n").errors[0]).toMatch(/conflict markers/);
    const twice = `{"version":1}\n{"p":"a","a":"other","k":"file","l":1}\n{"p":"a","a":"other","k":"file","l":2}\n`;
    expect(parseBaseline(twice).errors[0]).toMatch(/twice/);
  });
});

describe("seam registry validation", () => {
  it("accepts a well-formed seam", () => {
    expect(validateSeamRegistry({ seams: [seam()] }).errors).toEqual([]);
  });

  it("rejects vague, oversized, duplicate and match-all seams", () => {
    const bad = validateSeamRegistry({
      seams: [
        seam({ nexiImplementation: "TBD" }),
        seam({ maxLoc: 5000, files: ["**"] }),
        seam({ id: "Not Kebab", kind: "vendor-thing", owner: "" }),
        seam({ description: "short" }),
      ],
    }).errors.join("\n");
    expect(bad).toMatch(/nexiImplementation/);
    expect(bad).toMatch(/maxLoc/);
    expect(bad).toMatch(/match-all/);
    expect(bad).toMatch(/kebab-case/);
    expect(bad).toMatch(/kind must be one of/);
    expect(bad).toMatch(/owner/);
    expect(bad).toMatch(/description/);
    expect(validateSeamRegistry({ seams: [seam(), seam()] }).errors.join()).toMatch(/duplicate id/);
  });
});

describe("placement ratchet evaluation", () => {
  const legacy = item("packages/contracts/src/t3team-legacy.ts", 100);
  const edited = item("packages/contracts/src/ipc.ts", 10, "modified");

  it("passes when nothing changed, including legacy files and whitelisted upstream edits", () => {
    const result = evaluate({
      items: itemsOf(legacy, edited),
      baseline: baselineOf(legacy, edited),
    });
    expect(result.increases).toEqual([]);
    expect(result.lockIns).toEqual([]);
  });

  it("fails a new Nexi file in a restricted area, but only warns-by-delta elsewhere", () => {
    const result = evaluate({ items: itemsOf(item("apps/mobile/src/t3team-new.ts", 5)) });
    expect(result.increases[0]).toMatch(/grew in apps\/mobile\/src/);
    const web = evaluate({ items: itemsOf(item("apps/web/src/t3team-new.ts", 500)) });
    expect(web.increases).toEqual([]);
  });

  it("allows a new file inside a registered seam and tracks its budget", () => {
    const entry = item("apps/mobile/src/extensions/StartScreenSlot.tsx", 40);
    const ok = evaluate({ items: itemsOf(entry), registry: registryOf(seam()) });
    expect(ok.increases).toEqual([]);
    expect(ok.seamUsage.get("mobile-start-screen-slot")).toBe(40);
  });

  it("fails a seam that grows past its maxLoc", () => {
    const entry = item("apps/mobile/src/extensions/StartScreenSlot.tsx", 81);
    const result = evaluate({ items: itemsOf(entry), registry: registryOf(seam()) });
    expect(result.budget[0]).toMatch(/uses 81 lines but its budget is 80/);
    expect(hasBlockingGrowth(result)).toBe(true);
  });

  it("caps all seams together so many small seams cannot hide a big one", () => {
    const seams = Array.from({ length: 6 }, (_, index) =>
      seam({ id: `slot-${index}`, files: [`apps/mobile/src/extensions/Slot${index}.tsx`], maxLoc: 300 }),
    );
    const items = seams.map((entry, index) => item(`apps/mobile/src/extensions/Slot${index}.tsx`, 280));
    const result = evaluate({ items: itemsOf(...items), registry: registryOf(...seams) });
    expect(result.budget.join()).toMatch(/Registered seams total 1680 lines/);
  });

  it("fails growth of a baseline file and of an upstream-file edit", () => {
    const result = evaluate({
      items: itemsOf(item(legacy.path, 101), item(edited.path, 11, "modified")),
      baseline: baselineOf(legacy, edited),
    });
    expect(result.increases).toHaveLength(2);
  });

  it("locks reductions in: deleted, shrunk, and seam-covered baseline entries fail until rewritten", () => {
    const covered = item("apps/mobile/src/extensions/StartScreenSlot.tsx", 30);
    const result = evaluate({
      items: itemsOf(item(legacy.path, 60), covered),
      baseline: baselineOf(legacy, edited, covered),
      registry: registryOf(seam()),
    });
    expect(result.lockIns).toHaveLength(3);
    expect(result.lockIns.join("\n")).toMatch(/gone/);
    expect(result.lockIns.join("\n")).toMatch(/covered by a seam/);
    expect(result.lockIns[0]).toMatch(/--write-placement-baseline/);
  });

  it("judges growth against the base-ref baseline, so a PR cannot raise its own baseline", () => {
    const grown = item(legacy.path, 150);
    const result = evaluate({
      items: itemsOf(grown),
      baseline: baselineOf(grown),
      baseBaseline: baselineOf(legacy),
    });
    expect(result.increases[0]).toMatch(/went from 100 to 150/);
  });

  it("treats a rename inside the same area as the same footprint", () => {
    const moved = item("packages/contracts/src/t3team-renamed.ts", 100);
    const result = evaluate({
      items: itemsOf(moved),
      baseline: baselineOf(legacy),
      renames: new Map([[moved.path, legacy.path]]),
    });
    expect(result.increases).toEqual([]);
    expect(result.lockIns).toHaveLength(1);
    const crossArea = item("apps/mobile/src/t3team-renamed.ts", 100);
    const escaped = evaluate({
      items: itemsOf(crossArea),
      baseline: baselineOf(legacy),
      renames: new Map([[crossArea.path, legacy.path]]),
    });
    expect(escaped.increases).toHaveLength(1);
  });

  it("only relaxes upstream-file edit counts during an upstream sync", () => {
    const options = {
      items: itemsOf(item(edited.path, 14, "modified"), item("apps/mobile/src/t3team-x.ts", 3)),
      baseline: baselineOf(edited),
      isSync: true,
    };
    const result = evaluate(options);
    expect(result.warnings.join()).toMatch(/ipc\.ts/);
    expect(result.increases).toHaveLength(1);
    expect(result.increases[0]).toMatch(/t3team-x\.ts/);
    expect(result.lockIns[0]).toMatch(/out of date after the upstream sync/);
    const regenerated = evaluate({ ...options, baseline: baselineOf(item(edited.path, 14, "modified")) });
    expect(regenerated.lockIns).toEqual([]);
  });

  it("flags legacy footprint that a PR parks under a new seam", () => {
    const parked = item("apps/mobile/src/extensions/StartScreenSlot.tsx", 30);
    const result = evaluate({
      items: itemsOf(parked),
      baseline: new Map(),
      baseBaseline: baselineOf(parked),
      registry: registryOf(seam()),
    });
    expect(result.warnings[0]).toMatch(/REVIEW: legacy footprint file/);
  });

  it("surfaces an unreadable baseline and registry errors as violations", () => {
    const result = evaluate({ baselineErrors: ["conflict markers"], registry: { seams: [], errors: ["bad"], ignoreGlobs: [] } });
    expect(result.baselineErrors).toEqual(["conflict markers"]);
    expect(result.registryErrors).toEqual(["bad"]);
  });
});

describe("placement ratchet against a real git repository", () => {
  const makeRepo = () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "placement-"));
    const git = (args) =>
      NodeChildProcess.execFileSync("git", args, {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    const write = (rel, text) => {
      NodeFS.mkdirSync(NodePath.dirname(NodePath.join(dir, rel)), { recursive: true });
      NodeFS.writeFileSync(NodePath.join(dir, rel), text);
    };
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.email", "t@example.com"]);
    git(["config", "user.name", "t"]);
    write("packages/contracts/src/ipc.ts", "export const a = 1;\n");
    git(["add", "-A"]);
    git(["commit", "-qm", "upstream"]);
    git(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
    write("packages/contracts/src/t3team-legacy.ts", "export const b = 1;\nexport const c = 2;\n");
    git(["add", "-A"]);
    git(["commit", "-qm", "fork"]);
    git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    return { dir, git, write };
  };

  it("bootstraps with --init, then passes, then catches growth and locks in a reduction", () => {
    const { dir, git, write } = makeRepo();
    expect(writePlacementBaseline({ cwd: dir, git }).ok).toBe(false);
    expect(writePlacementBaseline({ cwd: dir, git, init: true }).ok).toBe(true);
    git(["add", "-A"]);
    git(["commit", "-qm", "baseline"]);
    git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    expect(runPlacementCheck({ cwd: dir, git }).violations).toEqual([]);

    write("packages/contracts/src/t3team-new.ts", "export const d = 1;\n");
    const grown = runPlacementCheck({ cwd: dir, git });
    expect(grown.violations[0]).toMatch(/t3team-new\.ts/);
    expect(writePlacementBaseline({ cwd: dir, git }).ok).toBe(false);
    NodeFS.rmSync(NodePath.join(dir, "packages/contracts/src/t3team-new.ts"));

    NodeFS.rmSync(NodePath.join(dir, "packages/contracts/src/t3team-legacy.ts"));
    const stale = runPlacementCheck({ cwd: dir, git });
    expect(stale.violations[0]).toMatch(/Baseline is higher than reality/);
    expect(writePlacementBaseline({ cwd: dir, git }).ok).toBe(true);
    expect(runPlacementCheck({ cwd: dir, git }).violations).toEqual([]);
  });

  it("recovers from a baseline with merge-conflict markers by regenerating it", () => {
    const { dir, git, write } = makeRepo();
    write(".t3team-placement-baseline.jsonl", "<<<<<<< HEAD\n=======\n>>>>>>> x\n");
    expect(runPlacementCheck({ cwd: dir, git }).violations.join()).toMatch(/conflict markers/);
    expect(writePlacementBaseline({ cwd: dir, git, init: true }).ok).toBe(true);
    expect(runPlacementCheck({ cwd: dir, git }).violations).toEqual([]);
  });

  it("does not count upstream sync content and detects the sync", () => {
    const { dir, git, write } = makeRepo();
    expect(detectUpstreamSync(git)).toBe(false);
    git(["checkout", "-q", "-b", "sync", "upstream/main"]);
    write("packages/contracts/src/upstreamNew.ts", "export const u = 1;\n");
    git(["add", "-A"]);
    git(["commit", "-qm", "upstream moves"]);
    git(["update-ref", "refs/remotes/upstream/main", "HEAD"]);
    git(["checkout", "-q", "main"]);
    git(["checkout", "-q", "-b", "sync-merge"]);
    git(["merge", "-q", "--no-edit", "upstream/main"]);
    expect(detectUpstreamSync(git)).toBe(true);
    expect(writePlacementBaseline({ cwd: dir, git, init: true }).ok).toBe(true);
    const baseline = NodeFS.readFileSync(NodePath.join(dir, ".t3team-placement-baseline.jsonl"), "utf8");
    expect(baseline).toContain("t3team-legacy.ts");
    expect(baseline).not.toContain("upstreamNew.ts");
  });

  it("skips quietly when upstream/main is not fetched", () => {
    const { dir, git } = makeRepo();
    git(["update-ref", "-d", "refs/remotes/upstream/main"]);
    const result = runPlacementCheck({ cwd: dir, git });
    expect(result.violations).toEqual([]);
    expect(result.notes[0]).toMatch(/skipped/);
  });
});
