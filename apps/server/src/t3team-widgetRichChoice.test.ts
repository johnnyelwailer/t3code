import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

import { createT3TeamWidgetRegistry } from "./t3team-widgetRegistry.ts";
import type { T3TeamThreadArtifactInput } from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { parseT3TeamWidgetShowInput } from "./t3team-widgetShowCore.ts";
import { callT3TeamWidgetShowTool } from "./t3team-widgetShowTool.ts";

const choice = {
  prompt: "Which role?",
  options: [
    { id: "engineer", title: "Engineer", body: "Code first.", chips: ["Lens: diffs"] },
    { id: "qa", title: "Quality", body: "Verify." },
  ],
  default_id: "qa",
};
const args = { title: "Role Choice", format: "rich-choice", choice };

describe("rich-choice widget input", () => {
  it("parses into the payload JSON with no builder or tools", () => {
    const parsed = parseT3TeamWidgetShowInput(args);
    if ("error" in parsed) throw new Error(parsed.error);
    assert.strictEqual(parsed.format, "rich-choice");
    assert.strictEqual(parsed.title, "role_choice");
    assert.deepStrictEqual(parsed.tools, []);
    assert.isUndefined(parsed.intent);
    assert.deepStrictEqual(JSON.parse(parsed.widgetCode), choice);
  });

  it("rejects widget_code, intent, a missing choice and a choice on another format", () => {
    for (const bad of [
      { ...args, widget_code: "<div/>" },
      { ...args, intent: "show roles" },
      { title: "x", format: "rich-choice" },
      { title: "x", format: "rich-choice", choice: { prompt: "p", options: [] } },
      { title: "x", widget_code: "<div/>", choice },
    ]) {
      assert.property(parseT3TeamWidgetShowInput(bad), "error");
    }
  });
});

describe("rich-choice widget tool", () => {
  it.effect(
    "records a native widget artifact, skips HTML render, and tells the agent to wait",
    () =>
      Effect.gen(function* () {
        const artifacts: T3TeamThreadArtifactInput[] = [];
        const published: unknown[] = [];
        const result = yield* callT3TeamWidgetShowTool({
          toolArgs: args,
          deps: {
            threadId: "thread-1",
            workspaceRoot: undefined,
            registry: createT3TeamWidgetRegistry(),
            recordArtifact: (input: T3TeamThreadArtifactInput) =>
              Effect.sync(() => {
                artifacts.push(input);
                return { ...input, messageId: null, createdAt: "t", updatedAt: "t" };
              }),
            persistenceContext: undefined,
            htmlRender: {
              prepare: () => Effect.succeed(""),
              publish: (input: unknown) => Effect.sync(() => published.push(input)),
              preview: () => Effect.die("never"),
            } as never,
          },
        });
        assert.notStrictEqual(result.isError, true);
        const shown = result.structuredContent as {
          format: string;
          message: string;
          htmlRender?: unknown;
        };
        assert.strictEqual(shown.format, "rich-choice");
        assert.include(shown.message, "wait");
        assert.isUndefined(shown.htmlRender);
        assert.strictEqual(published.length, 0);
        const attachment = artifacts[0]!.payload as T3TeamMessageWidgetAttachment;
        assert.strictEqual(attachment.widget.format, "rich-choice");
        assert.deepStrictEqual(JSON.parse(attachment.widget.html), choice);
      }),
  );
});
