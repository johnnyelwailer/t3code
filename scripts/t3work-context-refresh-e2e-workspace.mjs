#!/usr/bin/env node
/**
 * Creates a temp workspace with t3work project metadata for context-refresh E2E.
 * Usage: node scripts/t3work-context-refresh-e2e-workspace.mjs
 * Prints WORKSPACE_ROOT=<path> to stdout.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const repoRoot = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const fixturesDir = NodePath.join(repoRoot, "apps/server/__fixtures__");
const workspaceRoot = NodeFS.mkdtempSync(NodePath.join(fixturesDir, "t3work-context-refresh-e2e-"));
const projectId = "project-context-refresh-e2e";

NodeFS.mkdirSync(NodePath.join(workspaceRoot, ".t3work/context"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(workspaceRoot, ".t3work/context/metadata.json"),
  `${JSON.stringify(
    {
      project: {
        id: projectId,
        title: "Context Refresh E2E",
        source: {
          provider: "atlassian",
          accountId: "mock-atlassian",
          externalProjectId: "jira-proj-checkout",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    null,
    2,
  )}\n`,
);
NodeFS.mkdirSync(NodePath.join(workspaceRoot, ".t3work/context/work-items"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(workspaceRoot, ".t3work/context/work-items/index.json"),
  `${JSON.stringify(
    {
      workItems: [
        {
          key: "ac-91",
          ticketEntryPointRelativePath: `.t3work/context/jira/${projectId}/items/AC-91/entrypoint.json`,
        },
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(`WORKSPACE_ROOT=${workspaceRoot}`);
console.log(`PROJECT_ID=${projectId}`);
