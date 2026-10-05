import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

import { dispatchT3TeamToolCall } from "./t3team-toolBrokerBindingDispatch.ts";
import { buildBindingState } from "./t3team-toolBrokerBindingPermissions.ts";
import { createT3TeamWidgetRegistry } from "./t3team-widgetRegistry.ts";
import {
  T3TeamThreadArtifactsStoreError,
  type T3TeamThreadArtifactInput,
} from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { callT3TeamWidgetShowTool, t3teamWidgetArtifactId } from "./t3team-widgetShowTool.ts";
import { parseT3TeamWidgetShowInput } from "./t3team-widgetShowCore.ts";

const validArgs = {
  title: "q4_revenue_chart",
  widget_code: "<div>hello</div>",
  capabilities: { tools: ["t3team.view.read"] },
  loading_messages: ["Setting up the widget"],
};

function makeDeps() {
  const artifacts: T3TeamThreadArtifactInput[] = [];
  const registry = createT3TeamWidgetRegistry();
  return {
    artifacts,
    registry,
    deps: {
      threadId: "thread-1",
      workspaceRoot: undefined,
      registry,
      recordArtifact: (input: T3TeamThreadArtifactInput) =>
        Effect.sync(() => {
          artifacts.push(input);
          return {
            ...input,
            messageId: null,
            createdAt: "2026-10-03T00:00:00.000Z",
            updatedAt: "2026-10-03T00:00:00.000Z",
          };
        }),
      persistenceContext: undefined,
    },
  };
}

describe("parseT3TeamWidgetShowInput", () => {
  it("rejects document-level markup", () => {
    const parsed = parseT3TeamWidgetShowInput({
      title: "x",
      widget_code: "<!DOCTYPE html><html><body>hi</body></html>",
    });
    assert.isTrue("error" in parsed);
  });

  it("auto-detects svg format and accepts explicit html", () => {
    const svg = parseT3TeamWidgetShowInput({ title: "pie", widget_code: "<svg></svg>" });
    assert.isFalse("error" in svg);
    assert.strictEqual((svg as { format: string }).format, "svg");
    const html = parseT3TeamWidgetShowInput({
      title: "pie",
      widget_code: "<div/>",
      format: "html",
    });
    assert.strictEqual((html as { format: string }).format, "html");
  });

  it("returns a structured not-yet-supported error for mdx/tsx", () => {
    for (const format of ["mdx", "tsx"]) {
      const parsed = parseT3TeamWidgetShowInput({ title: "x", widget_code: "<div/>", format });
      assert.isTrue("error" in parsed);
      assert.include((parsed as { error: string }).error, `format '${format}'`);
      assert.include((parsed as { error: string }).error, "not yet available");
    }
  });

  it("rejects malformed capabilities and oversize code", () => {
    assert.isTrue(
      "error" in
        parseT3TeamWidgetShowInput({ title: "x", widget_code: "<div/>", capabilities: "nope" }),
    );
    assert.isTrue(
      "error" in
        parseT3TeamWidgetShowInput({
          title: "x",
          widget_code: `<div>${"a".repeat(129 * 1024)}</div>`,
        }),
    );
  });

  it("measures widget_code cap in UTF-8 bytes, not UTF-16 length", () => {
    // '€' is 1 UTF-16 unit but 3 UTF-8 bytes. 60k of them = 60k units (< 128k length) but
    // 180k bytes (> 128k cap), so a byte-correct cap must reject it.
    const euros = "€".repeat(60 * 1024);
    const parsed = parseT3TeamWidgetShowInput({ title: "x", widget_code: euros });
    assert.isTrue("error" in parsed);
    assert.include((parsed as { error: string }).error, "128 KB");
  });

  it("truncates each loading_messages item to 200 chars", () => {
    const parsed = parseT3TeamWidgetShowInput({
      title: "x",
      widget_code: "<div/>",
      loading_messages: ["a".repeat(500)],
    });
    assert.isFalse("error" in parsed);
    assert.strictEqual(
      (parsed as { loadingMessages: ReadonlyArray<string> }).loadingMessages[0]?.length,
      200,
    );
  });

  it("rejects self-referential widget tools in the allowlist", () => {
    const parsed = parseT3TeamWidgetShowInput({
      title: "x",
      widget_code: "<div/>",
      capabilities: { tools: ["t3team.widget.show"] },
    });
    assert.isTrue("error" in parsed);
  });
});

describe("callT3TeamWidgetShowTool", () => {
  it.effect("registers the allowlist and records a widget thread artifact", () =>
    Effect.gen(function* () {
      const { artifacts, registry, deps } = makeDeps();
      const result = yield* callT3TeamWidgetShowTool({ toolArgs: validArgs, deps });
      assert.notStrictEqual(result.isError, true);
      const structured = result.structuredContent as { widgetId: string; format: string };
      assert.strictEqual(structured.format, "html");

      const registration = yield* registry.get(structured.widgetId);
      assert.deepStrictEqual(registration?.tools, ["t3team.view.read"]);
      assert.strictEqual(registration?.threadId, "thread-1");

      assert.strictEqual(artifacts.length, 1);
      const artifact = artifacts[0]!;
      assert.strictEqual(artifact.id, t3teamWidgetArtifactId(structured.widgetId));
      assert.strictEqual(artifact.threadId, "thread-1");
      assert.strictEqual(artifact.kind, "widget");
      assert.strictEqual(artifact.messageId, null);
      const attachment = artifact.payload as T3TeamMessageWidgetAttachment | undefined;
      assert.strictEqual(attachment?.kind, "widget");
      assert.strictEqual(attachment?.widget.html, "<div>hello</div>");
      assert.deepStrictEqual(attachment?.widget.capabilities?.tools, ["t3team.view.read"]);
      assert.deepStrictEqual(attachment?.widget.loadingMessages, ["Setting up the widget"]);
      // No persistence context → inline-only widget, no artifact ref.
      assert.isUndefined(attachment?.widget.artifact);
    }),
  );

  it.effect("returns an error result for invalid input without recording", () =>
    Effect.gen(function* () {
      const { artifacts, deps } = makeDeps();
      const result = yield* callT3TeamWidgetShowTool({ toolArgs: { title: "x" }, deps });
      assert.strictEqual(result.isError, true);
      assert.strictEqual(artifacts.length, 0);
    }),
  );

  it.effect("fails when the artifact write fails and does NOT consume a registry slot", () =>
    Effect.gen(function* () {
      const registry = createT3TeamWidgetRegistry();
      const seen: string[] = [];
      const wrapped = {
        put: (r: Parameters<typeof registry.put>[0]) => {
          seen.push(r.widgetId);
          return registry.put(r);
        },
        get: registry.get,
      };
      const result = yield* callT3TeamWidgetShowTool({
        toolArgs: validArgs,
        deps: {
          threadId: "thread-1",
          workspaceRoot: undefined,
          registry: wrapped,
          recordArtifact: () =>
            Effect.fail(
              new T3TeamThreadArtifactsStoreError({ operation: "upsert", cause: "boom" }),
            ),
          persistenceContext: undefined,
        },
      });
      assert.strictEqual(result.isError, true);
      // Registration happens only AFTER a successful artifact write.
      assert.strictEqual(seen.length, 0);
    }),
  );
});

describe("t3team.widget.show broker dispatch gating", () => {
  const baseInput = {
    scopeLabel: "for this thread.",
    server: "t3team",
    tool: "t3team.widget.show",
    toolArgs: validArgs,
    readView: () => Effect.succeed({}),
  };

  it.effect("rejects when the showWidget callback is not wired", () =>
    Effect.gen(function* () {
      const state = buildBindingState({ availableToolIds: ["t3team.widget.show"] });
      const result = yield* dispatchT3TeamToolCall({ ...baseInput, state });
      assert.strictEqual(result.isError, true);
    }),
  );

  it.effect("rejects when the widget tool group is not allowed", () =>
    Effect.gen(function* () {
      const state = buildBindingState({
        availableToolIds: ["t3team.widget.show"],
        allowedToolGroups: ["integration.read"],
      });
      let called = false;
      const result = yield* dispatchT3TeamToolCall({
        ...baseInput,
        state,
        showWidget: () =>
          Effect.sync(() => {
            called = true;
            return { content: [{ type: "text" as const, text: "ok" }] };
          }),
      });
      assert.strictEqual(result.isError, true);
      assert.isFalse(called);
    }),
  );

  it.effect("invokes the callback when available and allowed", () =>
    Effect.gen(function* () {
      const state = buildBindingState({ availableToolIds: ["t3team.widget.show"] });
      const result = yield* dispatchT3TeamToolCall({
        ...baseInput,
        state,
        showWidget: () => Effect.succeed({ content: [{ type: "text" as const, text: "shown" }] }),
      });
      assert.notStrictEqual(result.isError, true);
      assert.strictEqual(result.content[0]?.text, "shown");
    }),
  );
});
