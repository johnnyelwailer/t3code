// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExternalProject, IntegrationAccount } from "@t3tools/integrations-core";

import type { BackendApi } from "~/t3team/backend/t3team-types";

const backendRef: { current: BackendApi | null } = { current: null };
vi.mock("~/t3team/backend/t3team-BackendContext", () => ({
  useBackend: () => backendRef.current,
}));

import { writeIntegrationCache } from "./t3team-integrationCache";
import {
  ATLASSIAN_ACCOUNTS_CACHE_KEY,
  atlassianProjectsCacheKey,
} from "./t3team-jiraProjectCatalog.logic";
import { fetchLiveJiraCatalog } from "./t3team-useJiraProjectCatalog";
import { useJiraProjectCatalogState } from "./t3team-useJiraProjectCatalogState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const account: IntegrationAccount = { id: "site-a", provider: "atlassian", label: "Acme" };
const project = (id: string, title: string): ExternalProject => ({
  id,
  provider: "atlassian",
  title,
  key: title.slice(0, 3).toUpperCase(),
});

let root: Root | null = null;

function render() {
  const current: { value: ReturnType<typeof useJiraProjectCatalogState> | null } = { value: null };
  root = createRoot(document.createElement("div"));
  act(() => {
    root!.render(
      createElement(function Probe() {
        current.value = useJiraProjectCatalogState();
        return null;
      }),
    );
  });
  return current;
}

beforeEach(() => {
  writeIntegrationCache(ATLASSIAN_ACCOUNTS_CACHE_KEY, []);
  writeIntegrationCache(atlassianProjectsCacheKey(account), []);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  backendRef.current = null;
});

describe("useJiraProjectCatalogState", () => {
  it("lets only the newest of two overlapping reads land", async () => {
    const resolvers: Array<(projects: ExternalProject[]) => void> = [];
    backendRef.current = {
      atlassian: {
        listAccounts: async () => [account],
        listProjects: () => new Promise<ExternalProject[]>((resolve) => resolvers.push(resolve)),
      },
    } as unknown as BackendApi;

    const current = render();
    await act(async () => {
      await Promise.resolve();
    });
    // The mount read is waiting on Jira; a refresh (e.g. after sign-in) starts a second one.
    let refreshed: Promise<void> = Promise.resolve();
    act(() => {
      refreshed = current.value!.refresh();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(resolvers).toHaveLength(2);

    // The newer read answers first; the older one's late, stale answer must not replace it.
    await act(async () => {
      resolvers[1]!([project("1", "Fresh"), project("2", "Newer")]);
      await refreshed;
    });
    await act(async () => {
      resolvers[0]!([project("1", "Stale")]);
      await Promise.resolve();
    });

    expect(current.value!.catalog.map((entry) => entry.title)).toEqual(["Fresh", "Newer"]);
    expect(current.value!.loading).toBe(false);
  });

  it("says Jira is unreachable when every site fails and nothing is cached", async () => {
    const backend = {
      atlassian: {
        listAccounts: async () => [account],
        listProjects: async () => {
          throw new Error("timeout");
        },
      },
    } as unknown as BackendApi;
    await expect(fetchLiveJiraCatalog(backend)).rejects.toThrow("timeout");
  });

  it("keeps a failed site's cached projects instead of failing", async () => {
    writeIntegrationCache(atlassianProjectsCacheKey(account), [project("1", "Cached")]);
    const backend = {
      atlassian: {
        listAccounts: async () => [account],
        listProjects: async () => {
          throw new Error("timeout");
        },
      },
    } as unknown as BackendApi;
    const live = await fetchLiveJiraCatalog(backend);
    expect(live.catalog.map((entry) => entry.title)).toEqual(["Cached"]);
  });

  it("surfaces a failed site on siteFailures without dropping the other site's projects", async () => {
    const otherAccount: IntegrationAccount = { id: "site-b", provider: "atlassian", label: "Beta" };
    backendRef.current = {
      atlassian: {
        listAccounts: async () => [account, otherAccount],
        listProjects: async (target: { id: string }) => {
          if (target.id === account.id) throw new Error("timeout");
          return [project("2", "Fine")];
        },
      },
    } as unknown as BackendApi;

    const current = render();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(current.value!.error).toBeNull();
    expect(current.value!.catalog.map((entry) => entry.title)).toEqual(["Fine"]);
    expect(current.value!.siteFailures.map((failure) => failure.accountId)).toEqual([account.id]);
  });
});
