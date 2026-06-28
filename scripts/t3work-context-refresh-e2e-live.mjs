#!/usr/bin/env node
/**
 * Live context-refresh E2E against a running t3work server (mock Jira provider).
 *
 * Usage:
 *   node scripts/t3work-context-refresh-e2e-workspace.mjs
 *   T3WORK_PAIRING_TOKEN=<token> node scripts/t3work-context-refresh-e2e-live.mjs
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { extractSessionCookie, fetchJson } from "./t3work-timer-e2e-live-lib.mjs";

const repoRoot = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.T3WORK_SERVER_URL ?? "http://localhost:3773";
const pairingToken = process.env.T3WORK_PAIRING_TOKEN?.trim();

if (!pairingToken) {
  console.error("T3WORK_PAIRING_TOKEN is required (see server startup pairingUrl).");
  process.exit(1);
}

const workspaceOutput = NodeChildProcess.execSync(
  "node scripts/t3work-context-refresh-e2e-workspace.mjs",
  { cwd: repoRoot, encoding: "utf8" },
);
const workspaceRoot = workspaceOutput
  .split("\n")
  .find((line) => line.startsWith("WORKSPACE_ROOT="))
  ?.slice("WORKSPACE_ROOT=".length)
  ?.trim();
const projectId = workspaceOutput
  .split("\n")
  .find((line) => line.startsWith("PROJECT_ID="))
  ?.slice("PROJECT_ID=".length)
  ?.trim();

if (!workspaceRoot || !projectId) {
  console.error("Failed to resolve workspace root or project id.");
  process.exit(1);
}

async function main() {
  console.log(`workspace=${workspaceRoot} projectId=${projectId}`);

  const { response: sessionResponse } = await fetchJson(baseUrl, "/api/auth/browser-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential: pairingToken }),
  });
  const cookie = extractSessionCookie(sessionResponse);

  await fetchJson(baseUrl, "/api/t3work/project/workspace/bootstrap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceRoot }),
  });

  const { body } = await fetchJson(
    baseUrl,
    "/api/t3work/project/workspace/context-refresh/work-item",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        projectId,
        workspaceRoot,
        ticketKey: "AC-91",
      }),
    },
  );

  const entryPointRelativePath = body.entryPointRelativePath;
  if (!entryPointRelativePath || body.status !== "synced") {
    throw new Error(`Unexpected refresh response: ${JSON.stringify(body)}`);
  }

  const entrypointPath = NodePath.join(workspaceRoot, entryPointRelativePath);
  if (!NodeFS.existsSync(entrypointPath)) {
    throw new Error(`Missing entrypoint on disk: ${entrypointPath}`);
  }
  const entrypoint = JSON.parse(NodeFS.readFileSync(entrypointPath, "utf8"));
  console.log(`entrypoint: key=${entrypoint.key} availability=${entrypoint.availability}`);

  const { body: cached } = await fetchJson(
    baseUrl,
    "/api/t3work/project/workspace/context-refresh/work-item",
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        projectId,
        workspaceRoot,
        ticketKey: "AC-91",
      }),
    },
  );
  if (cached.status !== "already_synced") {
    throw new Error(`Expected already_synced on repeat refresh: ${JSON.stringify(cached)}`);
  }
  console.log("repeat refresh: status=already_synced");

  if (body.backgroundJobId) {
    const dbPath = findSqliteDb();
    if (dbPath) {
      const deadline = Date.now() + 15000;
      let finalStatus = "unknown";
      while (Date.now() < deadline) {
        finalStatus = queryContextRefreshJobStatus(dbPath, body.backgroundJobId) ?? "missing";
        if (finalStatus === "completed") break;
        await sleep(200);
      }
      console.log(`background job ${body.backgroundJobId}: status=${finalStatus}`);
      if (finalStatus !== "completed") {
        throw new Error(`Background job did not complete: ${finalStatus}`);
      }
    } else {
      console.log("background job: sqlite db not found; skipping completion poll");
    }
  }

  console.log("PASS: context refresh E2E wrote server entrypoint on disk.");
}

function findSqliteDb() {
  const candidates = [
    NodePath.join(NodeOS.homedir(), ".t3/userdata/state.sqlite"),
    NodePath.join(NodeOS.homedir(), ".t3/dev/state.sqlite"),
  ];
  for (const file of candidates) {
    if (!NodeFS.existsSync(file)) continue;
    try {
      const tables = NodeChildProcess.execSync(`sqlite3 "${file}" ".tables"`, {
        encoding: "utf8",
      });
      if (tables.includes("t3work_context_refresh_jobs")) return file;
    } catch {
      // try next
    }
  }
  return null;
}

function queryContextRefreshJobStatus(dbPath, jobId) {
  const row = NodeChildProcess.execSync(
    `sqlite3 "${dbPath}" "SELECT status FROM t3work_context_refresh_jobs WHERE job_id='${jobId}';"`,
    { encoding: "utf8" },
  ).trim();
  return row || null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
