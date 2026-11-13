#!/usr/bin/env node
/**
 * Inventory gate: every create / open / setup surface must have a RENDER_CAP loop
 * test that uses live-shaped discovery or auth fakes (the LIVE_SHAPED_DISCOVERY
 * token) and does not fully mock the surface's discovery, auth, or sync hook.
 *
 * Plain Node, no workspace install: runs as a second step on the existing
 * rerender-gate job so the fork's CI quota does not grow by a new job.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const repoRoot = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));

export const SURFACES = [
  {
    id: "add-project",
    hint: "CreateProjectRoute",
    forbiddenMocks: ["useGitHubRepositoryDiscovery", "useGitHubAuthProbe"],
  },
  {
    id: "open-existing",
    hint: "OpenExistingProjectRedirect",
    forbiddenMocks: ["useGitHubRepositoryDiscovery", "useGitHubAuthProbe"],
  },
  {
    id: "linked-repos-dialog",
    hint: "ManageProjectRepositoriesDialog",
    forbiddenMocks: ["useGitHubRepositoryDiscovery", "useLinkedRepositorySyncStatus"],
  },
  {
    id: "welcome-setup",
    hint: "NexiWelcomePage",
    forbiddenMocks: [],
  },
  {
    id: "catalog",
    hint: "CreateProjectChooseStep",
    forbiddenMocks: [],
  },
  {
    id: "sync-chips",
    hint: "LinkedRepositorySyncChips",
    forbiddenMocks: ["useLinkedRepositorySyncStatus"],
  },
  {
    id: "inline-retry",
    hint: "Retry",
    alsoHint: "LinkedRepositorySync",
    forbiddenMocks: ["useLinkedRepositorySyncStatus"],
  },
];

function walk(dir, acc = []) {
  for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".repos" ||
      entry.name === "dist"
    ) {
      continue;
    }
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".loop.test.tsx") || entry.name.endsWith(".loop.test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function mocksForbiddenHook(source, hook) {
  // vi.mock("~/t3team/hooks/t3team-useGitHubRepositoryDiscovery", ...)
  const pattern = new RegExp(
    String.raw`vi\.mock\(\s*["'][^"']*${hook}["']`,
    "m",
  );
  return pattern.test(source);
}

export function evaluateSurfaceLoopGate(testFiles) {
  const missing = [];
  const reasons = [];
  for (const surface of SURFACES) {
    const covering = testFiles.filter((file) => {
      const source = file.source;
      if (!source.includes("LIVE_SHAPED_DISCOVERY")) return false;
      if (!source.includes("RENDER_CAP")) return false;
      if (!source.includes(surface.hint)) return false;
      if (surface.alsoHint && !source.includes(surface.alsoHint)) return false;
      for (const hook of surface.forbiddenMocks) {
        if (mocksForbiddenHook(source, hook)) return false;
      }
      return true;
    });
    if (covering.length === 0) {
      missing.push(surface.id);
      reasons.push(
        `${surface.id}: no *.loop.test.tsx mentions ${surface.hint}, RENDER_CAP and LIVE_SHAPED_DISCOVERY without mocking ${surface.forbiddenMocks.join(", ") || "those hooks"}`,
      );
    }
  }
  return { ok: missing.length === 0, missing, reasons };
}

function main() {
  const paths = walk(NodePath.join(repoRoot, "apps"));
  const testFiles = paths.map((path) => ({
    path,
    source: NodeFS.readFileSync(path, "utf8"),
  }));
  const result = evaluateSurfaceLoopGate(testFiles);
  if (!result.ok) {
    console.error("t3team surface-loop gate failed:\n" + result.reasons.join("\n"));
    process.exit(1);
  }
  console.log(
    `t3team surface-loop gate: ${SURFACES.length} surfaces covered by ${testFiles.length} loop test file(s).`,
  );
}

const isMain = process.argv[1] && NodeURL.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
