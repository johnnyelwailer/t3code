import { BUILTIN_SIGNAL_SOURCES, type SignalSourceContext } from "@t3team/sdk";
import { describe, expect, it } from "@effect/vitest";

import { PersistenceSqlError } from "./persistence/Errors.ts";
import type { GitHubSearchItem, SearchPullRequestsRead } from "./t3team-githubViewerSearch.ts";
import { makeWorkflowSignalSourceCatalog } from "./t3team-workflowSignalCatalog.ts";
import {
  projectSearchQueries,
  startScmProjectSignalInstance,
} from "./t3team-workflowSignalSourceScmProject.ts";

const hit = (number: number, over: Partial<GitHubSearchItem> = {}): GitHubSearchItem => ({
  number,
  title: `Item ${number}`,
  repository_url: "https://ghe.example/api/v3/repos/hive/app",
  html_url: `https://ghe.example/hive/app/issues/${number}`,
  state: "open",
  created_at: "2026-10-23T10:01:00Z",
  updated_at: "2026-10-23T10:01:00Z",
  labels: [{ name: "bug" }],
  author_association: "MEMBER",
  user: { login: "ana" },
  ...over,
});

type Emitted = { readonly key: string; readonly reason: string; readonly kind: string };

function harness() {
  let cursor: string | null = null;
  let now = "2026-10-23T10:00:00.000Z";
  let answer: SearchPullRequestsRead = { items: [], failed: false, truncated: false };
  let deliveryDown = false;
  const queries: string[] = [];
  const emitted: Emitted[] = [];
  const ctx: SignalSourceContext<{ projectId: string; query?: string }> = {
    params: { projectId: "p1", query: "is:issue" },
    emit: async (_signal, key, payload) => {
      if (deliveryDown) throw new PersistenceSqlError({ operation: "db", detail: "busy" });
      const event = payload as { reason: string; item: { kind: string } };
      emitted.push({ key, reason: event.reason, kind: event.item.kind });
    },
    getCursor: async () => cursor,
    setCursor: async (next) => {
      cursor = next;
    },
  };
  const instance = startScmProjectSignalInstance({
    ctx,
    pollMs: 3_600_000,
    log: () => {},
    ports: {
      nowIso: () => now,
      projectRepositories: async () => [
        { host: "ghe.example", repository: "hive/app", provider: "github" },
        { host: "dev.azure.com", repository: "org/other", provider: "azure-devops" },
      ],
      search: async ({ query }) => {
        queries.push(query);
        return answer;
      },
    },
  });
  return {
    instance,
    emitted,
    queries,
    cursor: () => cursor,
    at: (iso: string) => {
      now = iso;
    },
    answer: (next: SearchPullRequestsRead) => {
      answer = next;
    },
    setDeliveryDown: (down: boolean) => {
      deliveryDown = down;
    },
  };
}

const ok = (...items: GitHubSearchItem[]): SearchPullRequestsRead => ({
  items,
  failed: false,
  truncated: false,
});

describe("scm.project.items poller", () => {
  it("baselines without a search or an event, then emits only what changed after it", async () => {
    const h = harness();
    try {
      await h.instance.tick();
      expect(h.queries).toEqual([]);
      expect(h.emitted).toEqual([]);

      h.at("2026-10-23T10:02:00.000Z");
      h.answer(ok(hit(1), hit(2, { created_at: "2026-01-01T00:00:00Z" })));
      await h.instance.tick();
      expect(h.queries).toEqual(["repo:hive/app updated:>=2026-10-23T09:58:00Z is:issue"]);
      expect(h.emitted).toEqual([
        { key: "ghe.example:hive/app#1", reason: "opened", kind: "issue" },
        { key: "ghe.example:hive/app#2", reason: "updated", kind: "issue" },
      ]);

      // The overlapping window returns them again, unchanged: nothing re-emits.
      h.at("2026-10-23T10:04:00.000Z");
      await h.instance.tick();
      expect(h.emitted).toHaveLength(2);
    } finally {
      h.instance.stop();
    }
  });

  it("names state transitions: closed, reopened, merged", async () => {
    const h = harness();
    try {
      await h.instance.tick();
      h.at("2026-10-23T10:02:00.000Z");
      h.answer(ok(hit(1), hit(7, { pull_request: { merged_at: null } })));
      await h.instance.tick();
      h.at("2026-10-23T10:04:00.000Z");
      h.answer(
        ok(
          hit(1, { state: "closed", updated_at: "2026-10-23T10:03:00Z" }),
          hit(7, {
            state: "closed",
            updated_at: "2026-10-23T10:03:00Z",
            pull_request: { merged_at: "2026-10-23T10:03:00Z" },
          }),
        ),
      );
      await h.instance.tick();
      h.at("2026-10-23T10:06:00.000Z");
      h.answer(ok(hit(1, { state: "open", updated_at: "2026-10-23T10:05:00Z" })));
      await h.instance.tick();
      expect(h.emitted.slice(2)).toEqual([
        { key: "ghe.example:hive/app#1", reason: "closed", kind: "issue" },
        { key: "ghe.example:hive/app#7", reason: "merged", kind: "change-request" },
        { key: "ghe.example:hive/app#1", reason: "reopened", kind: "issue" },
      ]);
    } finally {
      h.instance.stop();
    }
  });

  it("holds the window when the search is refused (rate limit) and catches up without repeats", async () => {
    const h = harness();
    try {
      await h.instance.tick();
      h.at("2026-10-23T10:02:00.000Z");
      h.answer({ items: [hit(1)], failed: true, truncated: false });
      await h.instance.tick();
      expect(h.emitted.map((e) => e.key)).toEqual(["ghe.example:hive/app#1"]);
      expect(h.instance.health().lastError).toMatch(/refused or cut off on ghe.example/);

      h.at("2026-10-23T10:10:00.000Z");
      h.answer(ok(hit(1), hit(2, { updated_at: "2026-10-23T10:05:00Z" })));
      await h.instance.tick();
      // Same window start as the refused read: nothing in it was skipped.
      expect(h.queries[1]).toBe(h.queries[0]);
      expect(h.emitted.map((e) => e.key)).toEqual([
        "ghe.example:hive/app#1",
        "ghe.example:hive/app#2",
      ]);
    } finally {
      h.instance.stop();
    }
  });

  it("holds the cursor while delivery is down, then delivers", async () => {
    const h = harness();
    try {
      await h.instance.tick();
      const baseline = h.cursor();
      h.at("2026-10-23T10:02:00.000Z");
      h.answer(ok(hit(1)));
      h.setDeliveryDown(true);
      await h.instance.tick();
      expect(h.cursor()).toBe(baseline);
      h.setDeliveryDown(false);
      await h.instance.tick();
      expect(h.emitted.map((e) => e.reason)).toEqual(["opened"]);
    } finally {
      h.instance.stop();
    }
  });

  it("splits many repositories into bounded queries, each carrying the scope query", () => {
    const repositories = Array.from({ length: 10 }, (_, i) => `hive/r${i}`);
    const queries = projectSearchQueries({
      repositories,
      since: "2026-10-23T10:00:00.123Z",
      query: "label:triage",
    });
    expect(queries).toHaveLength(2);
    expect(queries[1]).toBe(
      "repo:hive/r8 repo:hive/r9 updated:>=2026-10-23T10:00:00Z label:triage",
    );
  });
});

describe("the catalog's project-scope sources", () => {
  it("are declared by the SDK, started by the host, and refuse malformed params", async () => {
    const catalog = makeWorkflowSignalSourceCatalog({
      pullRequestService: {} as never,
      projectScope: {
        scmProject: {
          nowIso: () => "2026-10-23T10:00:00.000Z",
          projectRepositories: async () => [],
          search: async () => ok(),
        },
      },
    });
    const ctx = (params: unknown) =>
      ({
        params,
        emit: async () => {},
        getCursor: async () => null,
        setCursor: async () => {},
      }) as never;
    for (const name of ["scm.project.items", "work-item.project-updates"]) {
      expect(BUILTIN_SIGNAL_SOURCES.map((s) => s.name)).toContain(name);
      expect(catalog.sourceNames.has(name)).toBe(true);
      await expect(catalog.start(name, ctx({}))).rejects.toThrow(/failed its declaration schema/);
    }
    const handle = await catalog.start("scm.project.items", ctx({ projectId: "p1" }));
    await handle.stop?.();
    await expect(
      catalog.start("work-item.project-updates", ctx({ projectId: "p1" })),
    ).rejects.toThrow(/was not given its reads/);
  });
});
