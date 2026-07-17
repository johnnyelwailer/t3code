import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { OrchestrationCommand, T3workMessageWidgetAttachment } from "@t3tools/contracts";

import { dispatchT3workToolCall } from "./t3work-toolBrokerBindingDispatch.ts";
import { buildBindingState } from "./t3work-toolBrokerBindingPermissions.ts";
import { createT3workWidgetRegistry } from "./t3work-widgetRegistry.ts";
import { callT3workWidgetShowTool } from "./t3work-widgetShowTool.ts";
import { parseT3workWidgetShowInput } from "./t3work-widgetShowCore.ts";

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

const validArgs = {
  title: "q4_revenue_chart",
  widget_code: "<div>hello</div>",
  capabilities: { tools: ["t3work.view.read"] },
  loading_messages: ["Setting up the widget"],
};

function makeDeps() {
  const commands: OrchestrationCommand[] = [];
  const registry = createT3workWidgetRegistry();
  return {
    commands,
    registry,
    deps: {
      threadId: "thread-1",
      workspaceRoot: undefined,
      registry,
      dispatch: (command: OrchestrationCommand) =>
        Effect.sync(() => {
          commands.push(command);
        }),
      persistenceContext: undefined,
    },
  };
}

describe("parseT3workWidgetShowInput", () => {
  it("rejects document-level markup", () => {
    const parsed = parseT3workWidgetShowInput({
      title: "x",
      widget_code: "<!DOCTYPE html><html><body>hi</body></html>",
    });
    assert.isTrue("error" in parsed);
  });

  it("auto-detects svg format and accepts explicit html", () => {
    const svg = parseT3workWidgetShowInput({ title: "pie", widget_code: "<svg></svg>" });
    assert.isFalse("error" in svg);
    assert.strictEqual((svg as { format: string }).format, "svg");
    const html = parseT3workWidgetShowInput({
      title: "pie",
      widget_code: "<div/>",
      format: "html",
    });
    assert.strictEqual((html as { format: string }).format, "html");
  });

  it("returns a structured not-yet-supported error for mdx/tsx", () => {
    for (const format of ["mdx", "tsx"]) {
      const parsed = parseT3workWidgetShowInput({ title: "x", widget_code: "<div/>", format });
      assert.isTrue("error" in parsed);
      assert.include((parsed as { error: string }).error, `format '${format}'`);
      assert.include((parsed as { error: string }).error, "not yet available");
    }
  });

  it("rejects malformed capabilities and oversize code", () => {
    assert.isTrue(
      "error" in
        parseT3workWidgetShowInput({ title: "x", widget_code: "<div/>", capabilities: "nope" }),
    );
    assert.isTrue(
      "error" in
        parseT3workWidgetShowInput({
          title: "x",
          widget_code: `<div>${"a".repeat(129 * 1024)}</div>`,
        }),
    );
  });
});

describe("callT3workWidgetShowTool", () => {
  it("registers the allowlist and posts a widget attachment message", async () => {
    const { commands, registry, deps } = makeDeps();
    const result = await run(callT3workWidgetShowTool({ toolArgs: validArgs, deps }));
    assert.notStrictEqual(result.isError, true);
    const structured = result.structuredContent as { widgetId: string; format: string };
    assert.strictEqual(structured.format, "html");

    const registration = await run(registry.get(structured.widgetId));
    assert.deepStrictEqual(registration?.tools, ["t3work.view.read"]);
    assert.strictEqual(registration?.threadId, "thread-1");

    assert.strictEqual(commands.length, 1);
    const command = commands[0]!;
    assert.strictEqual(command.type, "thread.message.upsert");
    const upsert = command as Extract<OrchestrationCommand, { type: "thread.message.upsert" }>;
    const attachment = upsert.message.t3workExt?.attachments?.[0] as
      | T3workMessageWidgetAttachment
      | undefined;
    assert.strictEqual(attachment?.kind, "widget");
    assert.strictEqual(attachment?.widget.html, "<div>hello</div>");
    assert.deepStrictEqual(attachment?.widget.capabilities?.tools, ["t3work.view.read"]);
    assert.deepStrictEqual(attachment?.widget.loadingMessages, ["Setting up the widget"]);
    // No persistence context → inline-only widget, no artifact ref.
    assert.isUndefined(attachment?.widget.artifact);
  });

  it("returns an error result for invalid input without dispatching", async () => {
    const { commands, deps } = makeDeps();
    const result = await run(callT3workWidgetShowTool({ toolArgs: { title: "x" }, deps }));
    assert.strictEqual(result.isError, true);
    assert.strictEqual(commands.length, 0);
  });

  it("fails when the message dispatch fails", async () => {
    const { registry } = makeDeps();
    const result = await run(
      callT3workWidgetShowTool({
        toolArgs: validArgs,
        deps: {
          threadId: "thread-1",
          workspaceRoot: undefined,
          registry,
          dispatch: () => Effect.fail("boom"),
          persistenceContext: undefined,
        },
      }),
    );
    assert.strictEqual(result.isError, true);
  });
});

describe("t3work.widget.show broker dispatch gating", () => {
  const baseInput = {
    scopeLabel: "for this thread.",
    server: "t3work",
    tool: "t3work.widget.show",
    toolArgs: validArgs,
    readView: () => Effect.succeed({}),
  };

  it("rejects when the showWidget callback is not wired", async () => {
    const state = buildBindingState({ availableToolIds: ["t3work.widget.show"] });
    const result = await run(dispatchT3workToolCall({ ...baseInput, state }));
    assert.strictEqual(result.isError, true);
  });

  it("rejects when the widget tool group is not allowed", async () => {
    const state = buildBindingState({
      availableToolIds: ["t3work.widget.show"],
      allowedToolGroups: ["integration.read"],
    });
    let called = false;
    const result = await run(
      dispatchT3workToolCall({
        ...baseInput,
        state,
        showWidget: () =>
          Effect.sync(() => {
            called = true;
            return { content: [{ type: "text" as const, text: "ok" }] };
          }),
      }),
    );
    assert.strictEqual(result.isError, true);
    assert.isFalse(called);
  });

  it("invokes the callback when available and allowed", async () => {
    const state = buildBindingState({ availableToolIds: ["t3work.widget.show"] });
    const result = await run(
      dispatchT3workToolCall({
        ...baseInput,
        state,
        showWidget: () => Effect.succeed({ content: [{ type: "text" as const, text: "shown" }] }),
      }),
    );
    assert.notStrictEqual(result.isError, true);
    assert.strictEqual(result.content[0]?.text, "shown");
  });
});
