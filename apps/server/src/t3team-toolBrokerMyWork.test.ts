import { assert, it } from "@effect/vitest";
import type { OrchestrationProjectShell } from "@t3tools/contracts";
import { getT3TeamToolDefinition } from "@t3tools/project-context/t3teamToolCatalog";
import {
  getProjectRecipeToolGroupForToolId,
  PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP,
  PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP,
} from "@t3tools/project-recipes";
import { BUNDLED_DASHBOARD_WIDGETS } from "@t3tools/t3team-skill-packs";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { layerMemory as SqlitePersistenceMemory } from "./persistence/Sqlite.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import { createT3TeamThreadToolBinding } from "./t3team-toolBrokerBinding.ts";
import { makeMyWorkHandlers } from "./t3team-toolBrokerMyWorkHandlers.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

const DIGEST = "t3team.mywork.digest.read";
const ARRANGE = "t3team.mywork.arrange";

const shell = (id: string, externalProjectId: string) =>
  ({
    id,
    title: `Project ${id}`,
    source: { provider: "atlassian", accountId: "acct-1", externalProjectId },
  }) as unknown as OrchestrationProjectShell;
const shells = [
  shell("app-1", "IES"),
  shell("app-2", "OPS"),
  { id: "app-3", title: "Local" } as unknown as OrchestrationProjectShell,
];

const plan = (heading: string) => ({
  sections: [
    {
      id: "now",
      kind: "items",
      placement: "main",
      heading,
      items: [{ ticketId: "t-1", why: "blocks the release" }],
    },
  ],
});

const asText = (result: { readonly content: ReadonlyArray<{ readonly text: string }> }) =>
  result.content.map((entry) => entry.text).join("\n");

it.layer(SqlitePersistenceMemory)("t3team.mywork.* tools", (it) => {
  /** A real binding over the real handlers; only the digest load and the project list are stubbed. */
  const makeBindingWith = (threadProjectId?: (threadId: string) => Effect.Effect<string, string>) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const loaded: T3TeamMyWorkDigestInput[] = [];
      const handlers = makeMyWorkHandlers({
        projects: {
          listShells: (options) =>
            Effect.succeed(
              options?.projectIds === undefined
                ? shells
                : shells.filter((candidate) => options.projectIds?.includes(candidate.id)),
            ),
        },
        ...(threadProjectId ? { threadProjectId } : {}),
        loadDigest: (digest) => {
          loaded.push(digest);
          return Effect.succeed({ scope: digest.scope, projects: [], viewer: { name: "Pat" } });
        },
        runStore: (effect) =>
          effect.pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.mapError((error) => (error instanceof Error ? error.message : String(error))),
          ),
      });
      const binding = createT3TeamThreadToolBinding({
        threadId,
        toolContext: createThreadToolContext({ tools: [] }),
        availableToolIds: [DIGEST, ARRANGE],
        allowedToolGroups: ["integration.read", "view.state"],
        readView: () => Effect.succeed({}),
        myWorkTools: handlers,
      });
      const call = (tool: string, args: unknown) =>
        binding.callTool({ server: "t3team", tool, arguments: args });
      return { call, loaded };
    });
  const makeBinding = makeBindingWith();

  it.effect("with no projectId, acts on the calling thread's project", () =>
    Effect.gen(function* () {
      const { call, loaded } = yield* makeBindingWith(() => Effect.succeed("app-2"));
      yield* call(DIGEST, {});
      assert.equal(loaded[0]?.scope, "project");
      assert.deepEqual(
        loaded[0]?.projects.map((p) => p.appProjectId),
        ["app-2"],
      );
    }),
  );

  it.effect("refuses to arrange another project than the calling thread's", () =>
    Effect.gen(function* () {
      const { call } = yield* makeBindingWith(() => Effect.succeed("app-2"));
      const result = yield* call(ARRANGE, { projectId: "app-1", reset: true });
      assert.isTrue(result.isError);
      assert.include(asText(result), "can only arrange that project");
    }),
  );

  it.effect("reads the digest for one project, or for every bound project", () =>
    Effect.gen(function* () {
      const { call, loaded } = yield* makeBinding;
      const one = yield* call(DIGEST, { projectId: "app-1" });
      assert.isUndefined(one.isError);
      assert.equal(loaded[0]?.scope, "project");
      assert.deepEqual(
        loaded[0]?.projects.map((p) => [p.appProjectId, p.externalProjectId]),
        [["app-1", "IES"]],
      );

      yield* call(DIGEST, {});
      assert.equal(loaded[1]?.scope, "all");
      // The unbound local project is left out, as the web leaves it out.
      assert.deepEqual(
        loaded[1]?.projects.map((p) => p.appProjectId),
        ["app-1", "app-2"],
      );

      const unbound = yield* call(DIGEST, { projectId: "app-3" });
      assert.isTrue(unbound.isError);
      assert.include(asText(unbound), "not bound to a Jira project");
    }),
  );

  it.effect("arrange stores the plan, the next read carries it, reset clears it", () =>
    Effect.gen(function* () {
      const { call } = yield* makeBinding;
      const stored = yield* call(ARRANGE, { projectId: "app-1", plan: plan("Do now") });
      assert.isUndefined(stored.isError);
      const structured = stored.structuredContent as {
        scope: string;
        arrangement: { producer: string; producedAt: string };
      };
      assert.equal(structured.scope, "project:app-1");
      // producer and producedAt are filled in for the agent.
      assert.equal(structured.arrangement.producer, "agent");
      assert.isString(structured.arrangement.producedAt);

      const read = yield* call(DIGEST, { projectId: "app-1" });
      const payload = read.structuredContent as {
        arrangement?: { sections: ReadonlyArray<{ heading: string }> };
      };
      assert.equal(payload.arrangement?.sections[0]?.heading, "Do now");

      // Another project's digest is unaffected.
      const other = yield* call(DIGEST, { projectId: "app-2" });
      assert.isUndefined((other.structuredContent as { arrangement?: unknown }).arrangement);

      const reset = yield* call(ARRANGE, { projectId: "app-1", reset: true });
      assert.isUndefined(reset.isError);
      const after = yield* call(DIGEST, { projectId: "app-1" });
      assert.isUndefined((after.structuredContent as { arrangement?: unknown }).arrangement);
    }),
  );

  it.effect("tells the agent what to fix", () =>
    Effect.gen(function* () {
      const { call } = yield* makeBinding;
      const section = plan("x").sections[0]!;

      const badWidget = yield* call(ARRANGE, {
        plan: { sections: [{ ...section, widget: "my-work.nope" }] },
      });
      assert.isTrue(badWidget.isError);
      assert.include(asText(badWidget), "unknown widget 'my-work.nope'");

      const badPlacement = yield* call(ARRANGE, {
        plan: {
          sections: [
            { ...section, kind: "reviews", items: [], reviewIds: ["pr-1"], placement: "footer" },
          ],
        },
      });
      assert.include(asText(badPlacement), "allowed: side, main");

      const human = yield* call(ARRANGE, { plan: { ...plan("x"), producer: "heuristic" } });
      assert.include(asText(human), "producer 'agent'");

      const neither = yield* call(ARRANGE, {});
      assert.include(asText(neither), "exactly one of 'plan' or 'reset: true'");
      const both = yield* call(ARRANGE, { plan: plan("x"), reset: true });
      assert.include(asText(both), "exactly one of 'plan' or 'reset: true'");
    }),
  );
});

it.effect("honors the recipe's tool groups: read is integration.read, arrange is view.state", () =>
  Effect.gen(function* () {
    assert.equal(
      getProjectRecipeToolGroupForToolId(DIGEST),
      PROJECT_RECIPE_INTEGRATION_READ_TOOL_GROUP.id,
    );
    assert.equal(
      getProjectRecipeToolGroupForToolId(ARRANGE),
      PROJECT_RECIPE_VIEW_STATE_TOOL_GROUP.id,
    );

    const broker = yield* T3TeamToolBroker;
    const toolContext = createThreadToolContext({
      tools: [
        { id: DIGEST, label: "digest", capabilities: ["read"] },
        { id: ARRANGE, label: "arrange", capabilities: ["write"] },
      ],
    });
    const readOnly = yield* broker.bindSession({
      threadId,
      toolContext,
      allowedToolGroups: ["integration.read"],
    });
    assert.deepEqual(Object.keys(readOnly?.listServers()[0]?.tools ?? {}), [DIGEST]);
    const denied = yield* readOnly!.callTool({ server: "t3team", tool: ARRANGE, arguments: {} });
    assert.include(asText(denied), "requires group 'view.state'");
  }).pipe(Effect.provide(makeBrokerLayer())),
);

it.effect("the catalog text matches the bundled widgets", () =>
  Effect.sync(() => {
    const arrange = getT3TeamToolDefinition(ARRANGE);
    const widgetIds = BUNDLED_DASHBOARD_WIDGETS.map((widget) => widget.id);
    const schema = arrange.inputSchema as {
      properties: {
        plan: {
          properties: {
            sections: { items: { properties: { widget: { enum: ReadonlyArray<string> } } } };
          };
        };
      };
    };
    assert.deepEqual(
      schema.properties.plan.properties.sections.items.properties.widget.enum,
      widgetIds,
    );
    for (const widget of BUNDLED_DASHBOARD_WIDGETS) {
      // "my-work.tickets lists tickets, placements side|main|footer"
      // "my-work.yesterday reads the digest itself, placements side|footer"
      const what = {
        tickets: "lists tickets",
        reviews: "lists review-owed pull requests",
        none: "reads the digest itself",
      }[widget.content];
      assert.include(
        arrange.description,
        `${widget.id} ${what}, placements ${widget.placements.join("|")}`,
      );
    }
  }),
);
