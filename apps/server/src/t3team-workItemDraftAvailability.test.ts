import { afterEach, assert, beforeEach, it } from "@effect/vitest";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { atlassianAuths } from "./t3team-atlassian-auth-state.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { makeBrokerLayer, threadId } from "./t3team-toolBrokerTestUtils.ts";
import {
  JIRA_NOT_CONNECTED_MESSAGE,
  WORK_ITEM_DRAFT_TOOL_ID,
} from "./t3team-workItemReadAvailability.ts";

const DRAFT = WORK_ITEM_DRAFT_TOOL_ID;
const jiraSource = {
  provider: "atlassian",
  accountId: "acct-1",
  externalProjectId: "10001",
} as const;
const signIn = () =>
  atlassianAuths.set("acct-1", {
    kind: "basic",
    siteUrl: "https://example.atlassian.net",
    email: "a@example.com",
    apiToken: "x",
  });
const draftsFlag = (on: boolean) =>
  replaceFeatureFlagPresetValues(new Map(on ? [["WORKITEM_DETAIL_DRAFTS", true]] : []));

beforeEach(() => draftsFlag(true));
afterEach(() => {
  atlassianAuths.clear();
  replaceFeatureFlagPresetValues(new Map());
});

/** The production wiring: the broker layer with the mirror's SQL, over a project with `source`. */
const bind = (input: {
  readonly withSql?: boolean;
  readonly allowedToolGroups?: ReadonlyArray<string>;
}) => {
  const layer = makeBrokerLayer(undefined, { projectSource: jiraSource });
  return Effect.gen(function* () {
    const broker = yield* T3TeamToolBroker;
    return yield* broker.bindSession({
      threadId,
      ...(input.allowedToolGroups === undefined
        ? {}
        : { allowedToolGroups: input.allowedToolGroups }),
    });
  }).pipe(
    Effect.provide(
      input.withSql === false ? layer : layer.pipe(Layer.provide(SqlitePersistenceMemory)),
    ),
  );
};
type Binding = Effect.Success<ReturnType<typeof bind>>;
const offered = (binding: Binding) =>
  Object.keys(binding?.listServers()[0]?.tools ?? {}).includes(DRAFT);
const call = (binding: Binding, args: unknown = { op: "comment", issue_id: "IES-1", body: "x" }) =>
  binding!.callTool({ server: "t3team", tool: DRAFT, arguments: args });
const text = (result: { readonly content: ReadonlyArray<{ readonly text?: string }> }) =>
  result.content[0]?.text ?? "";

it.effect("is offered only while a usable Jira account is bound AND the drafts flag is on", () =>
  Effect.gen(function* () {
    signIn();
    assert.isTrue(offered(yield* bind({})));
    draftsFlag(false);
    assert.isFalse(offered(yield* bind({})));
    draftsFlag(true);
    atlassianAuths.clear();
    assert.isFalse(offered(yield* bind({})));
  }),
);

it.effect("is not offered when the runtime cannot read the mirror, even with an account", () =>
  Effect.gen(function* () {
    signIn();
    const binding = yield* bind({ withSql: false });
    assert.isFalse(offered(binding));
    assert.strictEqual(text(yield* call(binding)), JIRA_NOT_CONNECTED_MESSAGE);
  }),
);

it.effect("a stale call while Jira is not connected gets the not-connected text", () =>
  Effect.gen(function* () {
    const result = yield* call(yield* bind({}));
    assert.isTrue(result.isError);
    assert.strictEqual(text(result), JIRA_NOT_CONNECTED_MESSAGE);
  }),
);

it.effect("a stale call after the flag went off gets the existing feature refusal", () =>
  Effect.gen(function* () {
    signIn();
    const binding = yield* bind({});
    assert.isTrue(offered(binding));
    draftsFlag(false);
    const result = yield* call(binding);
    assert.isTrue(result.isError);
    assert.include(text(result), "Work item detail and drafts is turned off on this host");
  }),
);

it.effect("a sign-out after the list is answered at the call, with nothing published", () =>
  Effect.gen(function* () {
    signIn();
    const binding = yield* bind({});
    atlassianAuths.clear();
    const result = yield* call(binding);
    assert.isTrue(result.isError);
    assert.strictEqual(text(result), JIRA_NOT_CONNECTED_MESSAGE);
  }),
);

it.effect("a recipe whose allowedToolGroups lack mutation.draft does not get it", () =>
  Effect.gen(function* () {
    signIn();
    for (const allowedToolGroups of [["integration.read"], ["view.state"], []]) {
      const binding = yield* bind({ allowedToolGroups });
      assert.isFalse(offered(binding), JSON.stringify(allowedToolGroups));
      const result = yield* call(binding);
      assert.include(text(result), "requires group 'mutation.draft'");
    }
    assert.isTrue(offered(yield* bind({ allowedToolGroups: ["mutation.draft"] })));
  }),
);
