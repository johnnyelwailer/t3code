import { afterEach, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { atlassianAuths } from "./t3team-atlassian-auth-state.ts";
import { setAccountNeedsReconnect } from "./t3team-atlassian-auth-staleToken.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeBrokerLayer, threadId } from "./t3team-toolBrokerTestUtils.ts";
import {
  JIRA_NOT_CONNECTED_MESSAGE,
  usableJiraBindingOfProject,
  WORK_ITEM_READ_TOOL_IDS,
} from "./t3team-workItemReadAvailability.ts";
import { readWorkItemRecordForProject } from "./t3team-workItemReadLive.ts";

const SEARCH = "t3team.work_item.search";
const GET = "t3team.work_item.get";
const jiraSource = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
} as const;
const signIn = (accountId = "acct-1") =>
  atlassianAuths.set(accountId, {
    kind: "basic",
    siteUrl: "https://example.atlassian.net",
    email: "a@example.com",
    apiToken: "x",
  });

/** The production wiring: the broker layer with the mirror's SQL, over a project with `source`. */
const bind = (input: {
  readonly withSql?: boolean;
  readonly source?: typeof jiraSource | { readonly provider: "local" };
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly grantedToolIds?: ReadonlyArray<string>;
}) => {
  const layer = makeBrokerLayer(undefined, { projectSource: input.source });
  return Effect.gen(function* () {
    const broker = yield* T3TeamToolBroker;
    return yield* broker.bindSession({
      threadId,
      ...(input.allowedToolGroups === undefined
        ? {}
        : { allowedToolGroups: input.allowedToolGroups }),
      ...(input.grantedToolIds === undefined ? {} : { grantedToolIds: input.grantedToolIds }),
    });
  }).pipe(
    Effect.provide(
      input.withSql === false ? layer : layer.pipe(Layer.provide(SqlitePersistenceMemory)),
    ),
  );
};
type Binding = Effect.Success<ReturnType<typeof bind>>;
const listed = (binding: Binding) =>
  Object.keys(binding?.listServers()[0]?.tools ?? {})
    .filter((id) => WORK_ITEM_READ_TOOL_IDS.has(id))
    .toSorted();
const call = (binding: Binding, tool: string, args: unknown = {}) =>
  binding!.callTool({ server: "t3team", tool, arguments: args });

afterEach(() => {
  atlassianAuths.clear();
  setAccountNeedsReconnect("acct-1", false);
});

it.effect("offers both tools while a usable Jira account is bound to the thread's project", () =>
  Effect.gen(function* () {
    signIn();
    expect(listed(yield* bind({ source: jiraSource }))).toEqual([GET, SEARCH]);
  }),
);

it.effect("offers neither without an Atlassian account on this host; a stale call is refused", () =>
  Effect.gen(function* () {
    const binding = yield* bind({ source: jiraSource });
    expect(listed(binding)).toEqual([]);
    for (const tool of [SEARCH, GET]) {
      const result = yield* call(binding, tool, { issueKey: "IES-1" });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe(JIRA_NOT_CONNECTED_MESSAGE);
    }
  }),
);

it.effect("offers neither when the account needs to sign in again", () =>
  Effect.gen(function* () {
    signIn();
    setAccountNeedsReconnect("acct-1", true);
    expect(listed(yield* bind({ source: jiraSource }))).toEqual([]);
  }),
);

it.effect("offers neither on a project bound to nothing, or to another account", () =>
  Effect.gen(function* () {
    signIn("acct-2");
    expect(listed(yield* bind({ source: jiraSource }))).toEqual([]);
    signIn();
    expect(listed(yield* bind({ source: { provider: "local" } }))).toEqual([]);
    expect(listed(yield* bind({}))).toEqual([]);
  }),
);

it.effect("fails closed when the runtime cannot read the mirror, even with an account", () =>
  Effect.gen(function* () {
    signIn();
    const binding = yield* bind({ source: jiraSource, withSql: false });
    expect(listed(binding)).toEqual([]);
    expect((yield* call(binding, SEARCH)).content[0]?.text).toBe(JIRA_NOT_CONNECTED_MESSAGE);
  }),
);

it.effect("a recipe that does not allow integration.read does not get them either", () =>
  Effect.gen(function* () {
    signIn();
    expect(listed(yield* bind({ source: jiraSource, allowedToolGroups: ["view.state"] }))).toEqual(
      [],
    );
    expect(
      listed(yield* bind({ source: jiraSource, allowedToolGroups: ["integration.read"] })),
    ).toEqual([GET, SEARCH]);
  }),
);

it.effect("a workflow run's per-call grant cannot conjure them without an account", () =>
  Effect.gen(function* () {
    const options = {
      source: jiraSource,
      allowedToolGroups: ["integration.read"],
      grantedToolIds: [SEARCH],
    } as const;
    expect(listed(yield* bind(options))).toEqual([]);
    signIn();
    expect(listed(yield* bind(options))).toEqual([GET, SEARCH]);
  }),
);

it.effect("the project record read is refused exactly where the tool is, with the same text", () =>
  Effect.gen(function* () {
    const read = (source: typeof jiraSource | { readonly provider: "local" } | undefined) =>
      readWorkItemRecordForProject({
        project: { source } as Parameters<typeof readWorkItemRecordForProject>[0]["project"],
        issueKey: "IES-1",
      }).pipe(Effect.flip, Effect.provide(SqlitePersistenceMemory));

    expect(yield* read(jiraSource)).toBe(JIRA_NOT_CONNECTED_MESSAGE);
    signIn();
    expect(yield* read({ provider: "local" })).toBe(JIRA_NOT_CONNECTED_MESSAGE);
    expect(yield* read(undefined)).toBe(JIRA_NOT_CONNECTED_MESSAGE);
    setAccountNeedsReconnect("acct-1", true);
    expect(yield* read(jiraSource)).toBe(JIRA_NOT_CONNECTED_MESSAGE);
  }),
);

it("resolves a project's usable binding the way a thread's is resolved", () => {
  expect(usableJiraBindingOfProject({ source: jiraSource }, () => true)).toEqual(jiraSource);
  expect(usableJiraBindingOfProject({ source: jiraSource }, () => false)).toBeNull();
  expect(usableJiraBindingOfProject({ source: { provider: "local" } }, () => true)).toBeNull();
});
