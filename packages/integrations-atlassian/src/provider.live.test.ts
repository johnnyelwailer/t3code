/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import { describe, expect, it } from "vite-plus/test";

import { AtlassianIntegrationProvider } from "./provider.ts";
import type { JiraApiAuth } from "./jiraApi.ts";

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

describeLive("AtlassianIntegrationProvider live backlog projection", () => {
  it("projects dashboard-ready backlog fields from the configured Jira auth", async () => {
    const auth = loadLiveAuth();
    const provider = new AtlassianIntegrationProvider(auth);

    const accounts = await provider.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);

    const account = accounts[0]!;
    const projects = await provider.listProjects({
      id: account.id,
      provider: account.provider,
    });
    expect(projects.length).toBeGreaterThan(0);

    let selectedProjectId: string | null = null;
    let backlogPage: Awaited<ReturnType<typeof provider.listBacklogResources>> | null = null;
    for (const project of projects) {
      const page = await provider.listBacklogResources({
        account: {
          id: account.id,
          provider: account.provider,
        },
        externalProjectId: project.id,
        limit: 20,
      });
      if (page.items.length > 0) {
        selectedProjectId = project.id;
        backlogPage = page;
        break;
      }
    }

    expect(selectedProjectId).toBeTruthy();
    expect(backlogPage).not.toBeNull();
    if (!selectedProjectId || !backlogPage) {
      return;
    }

    const capabilities = await provider.getBacklogCapabilities({
      account: {
        id: account.id,
        provider: account.provider,
      },
      externalProjectId: selectedProjectId,
    });
    const selection = await provider.getBacklogSelection({
      account: {
        id: account.id,
        provider: account.provider,
      },
      externalProjectId: selectedProjectId,
    });

    expect(backlogPage.totalCount).toBeGreaterThan(0);
    expect(backlogPage.items.length).toBeGreaterThan(0);

    const firstItem = backlogPage.items[0]!;
    expect(firstItem.displayId).toBeTruthy();
    expect(firstItem.title).toBeTruthy();
    expect(firstItem.status).toBeTruthy();
    expect(firstItem.updatedAt).toBeTruthy();

    if (firstItem.assignee !== undefined) {
      expect(typeof firstItem.assignee).toBe("string");
    }

    if (firstItem.priority !== undefined) {
      expect(typeof firstItem.priority).toBe("string");
    }

    if ("assigneeAccountId" in firstItem && firstItem.assigneeAccountId !== undefined) {
      expect(typeof firstItem.assigneeAccountId).toBe("string");
    }

    if ("estimateValue" in firstItem && firstItem.estimateValue !== undefined) {
      expect(typeof firstItem.estimateValue).toBe("number");
    }

    if ("subtaskCount" in firstItem && firstItem.subtaskCount !== undefined) {
      expect(typeof firstItem.subtaskCount).toBe("number");
    }

    if ("sprintId" in firstItem && firstItem.sprintId !== undefined) {
      expect(typeof firstItem.sprintId).toBe("string");
    }

    if ("sprintName" in firstItem && firstItem.sprintName !== undefined) {
      expect(typeof firstItem.sprintName).toBe("string");
    }

    expect(typeof capabilities.canCreateSubtasks).toBe("boolean");
    if (capabilities.estimateFieldLabel !== undefined) {
      expect(capabilities.estimateFieldLabel.length).toBeGreaterThan(0);
    }

    expect(Array.isArray(selection.boards)).toBe(true);
    expect(Array.isArray(selection.sprints)).toBe(true);
    if (selection.selectedBoardId !== undefined) {
      expect(typeof selection.selectedBoardId).toBe("string");
    }
    if (selection.selectedSprintId !== undefined) {
      expect(typeof selection.selectedSprintId).toBe("string");
    }
  });
});
