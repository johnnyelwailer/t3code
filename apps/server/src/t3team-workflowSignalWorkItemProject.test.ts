import type { SignalSourceContext } from "@t3team/sdk";
import { assert, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import * as SqlitePersistence from "./persistence/Sqlite.ts";
import { upsertMirrorIssues } from "./t3team-atlassian-backlog-mirrorSyncDb.ts";
import { recordT3TeamMirrorCatchUp } from "./t3team-atlassian-mirrorSyncState.ts";
import {
  startWorkItemProjectSignalInstance,
  type WorkItemProjectPorts,
} from "./t3team-workflowSignalSourceWorkItemProject.ts";
import {
  readMirrorBaseline,
  readMirrorChangedSince,
  type JiraMirrorBinding,
  type MirrorChangeRow,
} from "./t3team-workflowSignalWorkItemProjectMirror.ts";

const binding: JiraMirrorBinding = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
};

const row = (issueKey: string, updatedAt: number, fields: Record<string, unknown>) => ({
  issueKey,
  updatedAt,
  resourceJson: encodeResource({
    id: issueKey,
    displayId: issueKey,
    title: `Title ${issueKey}`,
    url: `https://jira.example/browse/${issueKey}`,
    ...fields,
  }),
});

const encodeResource = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

type Emitted = { readonly key: string; readonly changedFields: ReadonlyArray<string> };

function harness(input: { query?: string } = {}) {
  let cursor: string | null = null;
  let baseline: number | null = null;
  let rows: MirrorChangeRow[] = [];
  let bound = true;
  const jqlCalls: Array<ReadonlyArray<string>> = [];
  const emitted: Emitted[] = [];
  const ports: WorkItemProjectPorts = {
    resolveBinding: async () => (bound ? binding : null),
    keepMirrorWalking: async () => true,
    baseline: async () => baseline,
    changedSince: async (_binding, sinceMs) => rows.filter((r) => r.updatedAt >= sinceMs),
    filterByJql: async (_binding, _jql, keys) => {
      jqlCalls.push(keys);
      return new Set(keys.filter((key) => key !== "IES-9"));
    },
  };
  const ctx: SignalSourceContext<{ projectId: string; query?: string }> = {
    params: { projectId: "p1", ...input },
    emit: async (_signal, key, payload) => {
      emitted.push({ key, changedFields: (payload as { changedFields: string[] }).changedFields });
    },
    getCursor: async () => cursor,
    setCursor: async (next) => {
      cursor = next;
    },
  };
  const instance = startWorkItemProjectSignalInstance({
    ctx,
    ports,
    pollMs: 3_600_000,
    log: () => {},
  });
  return {
    instance,
    emitted,
    jqlCalls,
    cursor: () => cursor,
    setBaseline: (value: number | null) => {
      baseline = value;
    },
    setRows: (next: MirrorChangeRow[]) => {
      rows = next;
    },
    unbind: () => {
      bound = false;
    },
  };
}

describe("work-item.project-updates poller", () => {
  it("waits for the mirror's first catch-up before it baselines, so that walk never floods", async () => {
    const h = harness();
    try {
      h.setRows([row("IES-1", 100, { status: "To Do" })]);
      await h.instance.tick();
      expect(h.cursor()).toBeNull();
      expect(h.emitted).toEqual([]);

      h.setBaseline(101);
      await h.instance.tick();
      expect(h.cursor()).not.toBeNull();
      expect(h.emitted).toEqual([]);
    } finally {
      h.instance.stop();
    }
  });

  it("emits changed fields, ignores rows whose watched fields did not move", async () => {
    const h = harness();
    try {
      h.setBaseline(101);
      await h.instance.tick();
      h.setRows([row("IES-2", 200, { status: "To Do", updatedAt: "2026-10-23T10:00:00Z" })]);
      await h.instance.tick();
      h.setRows([
        row("IES-2", 300, {
          status: "In Progress",
          assignee: "Ana",
          updatedAt: "2026-10-23T10:05:00Z",
        }),
      ]);
      await h.instance.tick();
      // A cache writer touched the row without a Jira change: same fields, nothing to say.
      h.setRows([
        row("IES-2", 400, {
          status: "In Progress",
          assignee: "Ana",
          updatedAt: "2026-10-23T10:05:00Z",
        }),
      ]);
      await h.instance.tick();
      expect(h.emitted).toEqual([
        { key: "IES-2", changedFields: ["updated"] },
        { key: "IES-2", changedFields: ["status", "assignee", "updated"] },
      ]);
    } finally {
      h.instance.stop();
    }
  });

  it("narrows by JQL with one bounded key search, only when there are changes", async () => {
    const h = harness({ query: "labels = triage" });
    try {
      h.setBaseline(101);
      await h.instance.tick();
      await h.instance.tick();
      expect(h.jqlCalls).toEqual([]);
      h.setRows([row("IES-3", 200, { status: "To Do" }), row("IES-9", 200, { status: "To Do" })]);
      await h.instance.tick();
      expect(h.jqlCalls).toEqual([["IES-3", "IES-9"]]);
      expect(h.emitted.map((e) => e.key)).toEqual(["IES-3"]);
    } finally {
      h.instance.stop();
    }
  });

  it("does nothing for a project bound to no Jira project", async () => {
    const h = harness();
    try {
      h.unbind();
      h.setBaseline(101);
      await h.instance.tick();
      expect(h.cursor()).toBeNull();
    } finally {
      h.instance.stop();
    }
  });
});

describe("the backlog mirror as the source's lane", () => {
  it.effect("reads only rows the mirror wrote since the cursor, and baselines after catch-up", () =>
    Effect.gen(function* () {
      assert.isNull(yield* readMirrorBaseline(binding));
      yield* upsertMirrorIssues({
        identity: binding,
        items: [{ id: "1", displayId: "IES-1", updatedAt: "2026-10-23T10:00:00Z" }],
      });
      yield* recordT3TeamMirrorCatchUp(binding, 1);
      const baseline = yield* readMirrorBaseline(binding);
      assert.isNotNull(baseline);
      expect(yield* readMirrorChangedSince(binding, baseline!, 50)).toEqual([]);

      // A later walk moves IES-1 (newer Jira updatedAt) and inserts IES-2.
      yield* TestClock.adjust("10 millis");
      yield* upsertMirrorIssues({
        identity: binding,
        items: [
          { id: "1", displayId: "IES-1", updatedAt: "2026-10-23T11:00:00Z" },
          { id: "2", displayId: "IES-2", updatedAt: "2026-10-23T11:00:00Z" },
        ],
      });
      const changed = yield* readMirrorChangedSince(binding, baseline!, 50);
      expect(changed.map((r) => r.issueKey).toSorted()).toEqual(["IES-1", "IES-2"]);
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
  );
});
