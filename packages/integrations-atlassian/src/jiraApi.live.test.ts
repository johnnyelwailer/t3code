/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import { describe, expect, it } from "vite-plus/test";

import type { JiraProject } from "./client.ts";
import { JiraApiClient, type JiraApiAuth } from "./jiraApi.ts";
import { findJiraEstimateField } from "./planning.ts";

type PersistedAuths = {
  readonly auths?: ReadonlyArray<{
    readonly accountId: string;
    readonly auth: JiraApiAuth;
  }>;
};

const RUN_LIVE_TESTS = /^(1|true)$/i.test(process.env.T3WORK_RUN_LIVE_ATLASSIAN_TESTS ?? "");
const describeLive = RUN_LIVE_TESTS ? describe : describe.skip;

function resolveAuthFilePath(): string {
  return (
    process.env.T3WORK_ATLASSIAN_LIVE_AUTH_PATH ??
    `${NodeOS.homedir()}/.t3/dev/secrets/t3work-atlassian-auths.bin`
  );
}

function loadLiveAuth(): JiraApiAuth {
  const authFilePath = resolveAuthFilePath();
  if (!NodeFS.existsSync(authFilePath)) {
    throw new Error(`Missing Atlassian auth file: ${authFilePath}`);
  }

  const parsed = JSON.parse(NodeFS.readFileSync(authFilePath, "utf8")) as PersistedAuths;
  const requestedAccountId = process.env.T3WORK_ATLASSIAN_LIVE_ACCOUNT_ID?.trim();
  const entry = requestedAccountId
    ? parsed.auths?.find((candidate) => candidate.accountId === requestedAccountId)
    : parsed.auths?.[0];

  if (!entry) {
    const suffix = requestedAccountId ? ` for account ${requestedAccountId}` : "";
    throw new Error(`No Atlassian auth entry found${suffix}.`);
  }

  return entry.auth;
}

async function findSampleProjectIssue(
  client: JiraApiClient,
  projects: ReadonlyArray<JiraProject>,
  estimateFieldId?: string,
): Promise<{ projectId: string; issueIdOrKey: string } | null> {
  for (const project of projects) {
    const escapedKey = project.key.replace(/"/g, '\\"');
    const search = await client.searchIssues(
      `project = "${escapedKey}" ORDER BY updated DESC`,
      1,
      estimateFieldId ? [estimateFieldId] : [],
    );
    const firstIssue = search.issues[0] as { key?: unknown } | undefined;
    if (typeof firstIssue?.key === "string" && firstIssue.key.trim().length > 0) {
      return { projectId: project.id, issueIdOrKey: firstIssue.key };
    }
  }

  return null;
}

describeLive("JiraApiClient live verification", () => {
  it("verifies the Jira planning endpoints against the configured auth", async () => {
    const auth = loadLiveAuth();
    const client = new JiraApiClient(auth);

    const myself = await client.getMyself();
    expect(myself.accountId).toBeTruthy();

    const projects = await client.searchProjects();
    expect(projects.values.length).toBeGreaterThan(0);

    const fields = await client.listFields();
    expect(fields.length).toBeGreaterThan(0);
    const estimateField = findJiraEstimateField(fields);

    const sample = await findSampleProjectIssue(client, projects.values, estimateField?.id);
    expect(sample).not.toBeNull();
    if (!sample) {
      return;
    }

    const issue = await client.getIssue(
      sample.issueIdOrKey,
      estimateField ? [estimateField.id] : [],
    );
    expect(issue.key).toBe(sample.issueIdOrKey);

    const editMeta = await client.getIssueEditMeta(sample.issueIdOrKey);
    expect(Object.keys(editMeta.fields ?? {})).toContain("assignee");

    const assignableUsers = await client.searchAssignableUsers(sample.issueIdOrKey);
    expect(assignableUsers).toBeInstanceOf(Array);

    const createMeta = await client.getCreateMeta(sample.projectId);
    expect(createMeta.projects?.length ?? 0).toBeGreaterThan(0);
  });
});
