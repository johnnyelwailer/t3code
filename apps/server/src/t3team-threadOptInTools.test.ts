import { assert, describe, it } from "@effect/vitest";
import {
  replaceFeatureFlagPresetValues,
  type ReadFeatureFlagEnv,
} from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import { ProjectId, SourceControlProviderKind } from "@t3tools/contracts";
import {
  listOptInThreadTools,
  optInToolEnableHint,
  withFlaggedOptInTools,
} from "./t3team-threadOptInTools.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  createThreadToolContext,
  makeBrokerLayer,
  threadId,
} from "./t3team-toolBrokerTestUtils.ts";

const PUBLISH = "t3team.change_request.publish";
const FLAG = "AGENTS_CHANGE_REQUEST_PUBLISH";
const flagEnv =
  (value: string | undefined): ReadFeatureFlagEnv =>
  (key) =>
    key === "NEXI_FF_AGENTS_CHANGE_REQUEST_PUBLISH" ? value : undefined;

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

describe("opt-in thread tools", () => {
  it("are the catalog tools that default off, classified by tool group", () => {
    const publish = listOptInThreadTools().find((tool) => tool.toolId === PUBLISH);
    assert.deepStrictEqual(publish, { toolId: PUBLISH, group: "mutation.change_request" });
  });

  it("join the generic tools only while their host flag is on", () => {
    const base = ["t3team.thread.search"];
    assert.deepStrictEqual(withFlaggedOptInTools(base, flagEnv(undefined)), base);
    assert.deepStrictEqual(withFlaggedOptInTools(base, flagEnv("0")), base);
    assert.deepStrictEqual(withFlaggedOptInTools(base, flagEnv("1")), [...base, PUBLISH]);
    assert.deepStrictEqual(withFlaggedOptInTools([...base, PUBLISH], flagEnv("1")), [
      ...base,
      PUBLISH,
    ]);
  });

  it("name what enables them, and only for opt-in tools", () => {
    const hint = optInToolEnableHint(PUBLISH);
    assert.include(hint ?? "", "Settings → Features → Publish change requests");
    assert.include(hint ?? "", "mutation.change_request");
    assert.isUndefined(optInToolEnableHint("t3team.thread.search"));
  });
});

const published = {
  url: "https://example.test/pr/7",
  number: 7,
  repository: "acme/widgets",
  provider: SourceControlProviderKind.make("github"),
  branch: "b",
  commit: "abc",
  projectId: ProjectId.make("project-1"),
};
const publishArgs = { branch: "b", paths: ["a"], commitMessage: "m", title: "t", body: "b" };

const withBroker = Effect.fn("withBroker")(function* () {
  const publishCalls: unknown[] = [];
  const broker = yield* T3TeamToolBroker.pipe(
    Effect.provide(
      makeBrokerLayer(undefined, {
        changeRequestPublisher: {
          publish: (input) => Effect.sync(() => (publishCalls.push(input), published)),
        },
      }),
    ),
  );
  return { broker, publishCalls };
});

const callPublish = (broker: typeof T3TeamToolBroker.Service) =>
  Effect.gen(function* () {
    const binding = yield* broker.bindSession({ threadId });
    assert.isDefined(binding);
    return yield* binding!.callTool({
      server: "t3team",
      tool: PUBLISH,
      arguments: publishArgs,
      threadId,
    });
  });

describe("a plain thread (no synced tool context) calling t3team.change_request.publish", () => {
  it.effect("is refused with what enables it while the host flag is off", () =>
    Effect.gen(function* () {
      const { broker, publishCalls } = yield* withBroker();
      const result = yield* callPublish(broker);
      assert.isTrue(result.isError);
      const text = result.content[0]?.text ?? "";
      assert.include(
        text,
        `Tool '${PUBLISH}' is not enabled for this thread. It is off by default`,
      );
      assert.include(text, "Settings → Features → Publish change requests");
      assert.notInclude(text, "..");
      assert.deepStrictEqual(publishCalls, []);
    }),
  );

  it.effect("reaches the publisher while the host flag is on", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([[FLAG, true]]));
      const { broker, publishCalls } = yield* withBroker();
      const result = yield* callPublish(broker);
      assert.isNotTrue(result.isError);
      assert.strictEqual(publishCalls.length, 1);
    }),
  );

  it.effect("is still refused on a thread whose synced context does not select it", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([[FLAG, true]]));
      const { broker, publishCalls } = yield* withBroker();
      yield* broker.bindSession({
        threadId,
        toolContext: createThreadToolContext({
          tools: [{ id: "t3team.thread.children", label: "c", capabilities: ["read"] }],
        }),
      });
      const result = yield* callPublish(broker);
      assert.isTrue(result.isError);
      assert.include(result.content[0]?.text ?? "", "is not enabled for this thread.");
      assert.deepStrictEqual(publishCalls, []);
    }),
  );
});
