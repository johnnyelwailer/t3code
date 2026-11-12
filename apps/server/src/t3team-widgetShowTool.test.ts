import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import { htmlRenderFromToolItem } from "@t3tools/shared/toolOutput";

import { dispatchT3TeamToolCall } from "./t3team-toolBrokerBindingDispatch.ts";
import { buildBindingState } from "./t3team-toolBrokerBindingPermissions.ts";
import { createT3TeamWidgetRegistry } from "./t3team-widgetRegistry.ts";
import {
  T3TeamThreadArtifactsStoreError,
  type T3TeamThreadArtifactInput,
} from "./t3team-v2/t3team-threadArtifactsStore.ts";
import { callT3TeamWidgetShowTool, t3teamWidgetArtifactId } from "./t3team-widgetShowTool.ts";
import {
  buildT3TeamWidgetHtmlDocument,
  T3TEAM_WIDGET_HTML_CSP,
  t3teamWidgetNeedsBridge,
} from "./t3team-widgetHtmlDocument.ts";
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
      htmlRender: undefined,
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
          htmlRender: undefined,
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
    scopeLabel: "for this thread",
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

describe("upstream HTML render path", () => {
  function makeHtmlRender(options: { readonly fail?: boolean } = {}) {
    const published: Array<{ html: string; title: string; height: number }> = [];
    const htmlRender = {
      prepare: () => Effect.succeed(""),
      publish: (input: {
        readonly threadId: string;
        readonly html: string;
        readonly title: string;
        readonly height: number;
      }) =>
        options.fail
          ? Effect.fail({ _tag: "HtmlRenderStoreError", message: "disk full", cause: "boom" })
          : Effect.sync(() => {
              published.push({ html: input.html, title: input.title, height: input.height });
              return {
                attachmentId: `${input.threadId}-widget-html`,
                title: input.title,
                height: input.height,
              };
            }),
      preview: () => Effect.die("show_widget never previews"),
    };
    return { published, htmlRender: htmlRender as never };
  }

  it("builds a self-contained page with the widget CSP and icon sprite", () => {
    const page = buildT3TeamWidgetHtmlDocument("<div>hello</div>");
    assert.include(page, T3TEAM_WIDGET_HTML_CSP);
    assert.include(page, 'id="t3w-icon-check"');
    assert.include(page, ".t3w-icon");
    assert.isAbove(page.indexOf("<div>hello</div>"), page.indexOf("<body>"));
  });

  it("sends only bridge widgets to the srcdoc path", () => {
    assert.isFalse(t3teamWidgetNeedsBridge({ widgetCode: "<div>x</div>", tools: [] }));
    assert.isTrue(t3teamWidgetNeedsBridge({ widgetCode: "<div/>", tools: ["t3team.view.read"] }));
    assert.isTrue(
      t3teamWidgetNeedsBridge({
        widgetCode: "<button onclick=\"sendPrompt('go')\">Go</button>",
        tools: [],
      }),
    );
    assert.isTrue(
      t3teamWidgetNeedsBridge({
        widgetCode: "<script>window.host.callTool('x')</script>",
        tools: [],
      }),
    );
  });

  it.effect("publishes html and svg like html_render, with no fork artifact or registry slot", () =>
    Effect.gen(function* () {
      for (const widget_code of ["<div id='c'>chart</div>", "<svg viewBox='0 0 1 1'></svg>"]) {
        const { artifacts, registry, deps } = makeDeps();
        const { published, htmlRender } = makeHtmlRender();
        const result = yield* callT3TeamWidgetShowTool({
          toolArgs: { title: "chart", widget_code },
          deps: { ...deps, htmlRender },
        });
        assert.notStrictEqual(result.isError, true);
        const structured = result.structuredContent as { widgetId: string; message: string };
        assert.strictEqual(published.length, 1);
        assert.include(published[0]!.html, widget_code);
        assert.include(structured.message, "above your reply");
        assert.strictEqual(artifacts.length, 0);
        assert.isUndefined(yield* registry.get(structured.widgetId));
        // Upstream's timeline (web + mobile) and thread-deletion cleanup read the result directly.
        for (const toolName of ["mcp__t3-code__t3_show_widget", "t3-code.t3_show_widget"]) {
          assert.deepStrictEqual(
            htmlRenderFromToolItem({ toolName, output: result.structuredContent }),
            { attachmentId: "thread-1-widget-html", title: "chart", height: 400 },
          );
        }
      }
    }),
  );

  it.effect("keeps bridge widgets on the artifact path without publishing", () =>
    Effect.gen(function* () {
      for (const toolArgs of [
        validArgs,
        { title: "ask", widget_code: "<button onclick=\"sendPrompt('yes')\">Yes</button>" },
      ]) {
        const { artifacts, deps } = makeDeps();
        const { published, htmlRender } = makeHtmlRender();
        const result = yield* callT3TeamWidgetShowTool({
          toolArgs,
          deps: { ...deps, htmlRender },
        });
        assert.notStrictEqual(result.isError, true);
        assert.strictEqual(published.length, 0);
        assert.strictEqual(artifacts.length, 1);
        assert.isUndefined((result.structuredContent as { htmlRender?: unknown }).htmlRender);
      }
    }),
  );

  it.effect("degrades to the artifact path when HtmlRender.publish fails", () =>
    Effect.gen(function* () {
      const { artifacts, deps } = makeDeps();
      const result = yield* callT3TeamWidgetShowTool({
        toolArgs: { title: "x", widget_code: "<div>ok</div>", format: "html" },
        deps: { ...deps, htmlRender: makeHtmlRender({ fail: true }).htmlRender },
      });
      assert.notStrictEqual(result.isError, true);
      const attachment = artifacts[0]!.payload as T3TeamMessageWidgetAttachment;
      assert.strictEqual(attachment.widget.html, "<div>ok</div>");
      assert.isUndefined((result.structuredContent as { htmlRender?: unknown }).htmlRender);
    }),
  );
});

describe("intent → builder seam", () => {
  it("parses intent-only and widget_code+intent (code wins for body)", () => {
    const intentOnly = parseT3TeamWidgetShowInput({
      title: "board",
      intent: "Show a kanban of open PRs",
    });
    assert.isFalse("error" in intentOnly);
    assert.strictEqual((intentOnly as { widgetCode: string }).widgetCode, "");
    assert.strictEqual((intentOnly as { intent: string }).intent, "Show a kanban of open PRs");

    const both = parseT3TeamWidgetShowInput({
      title: "board",
      intent: "ignored for body",
      widget_code: "<div>raw</div>",
    });
    assert.isFalse("error" in both);
    assert.strictEqual((both as { widgetCode: string }).widgetCode, "<div>raw</div>");
    assert.strictEqual((both as { intent: string }).intent, "ignored for body");
  });

  it.effect("intent-only hits builder seam and fails without inventing HTML", () =>
    Effect.gen(function* () {
      const { artifacts, deps } = makeDeps();
      const result = yield* callT3TeamWidgetShowTool({
        toolArgs: { title: "board", intent: "Show open PRs as a board" },
        deps,
      });
      assert.strictEqual(result.isError, true);
      const structured = result.structuredContent as { error?: string } | undefined;
      assert.include(String(structured?.error ?? ""), "builder");
      assert.strictEqual(artifacts.length, 0);
    }),
  );

  it.effect("widget_code bypasses builder even when intent is also set", () =>
    Effect.gen(function* () {
      const { artifacts, deps } = makeDeps();
      const result = yield* callT3TeamWidgetShowTool({
        toolArgs: {
          title: "board",
          intent: "would build",
          widget_code: "<div>bypass</div>",
          format: "html",
        },
        deps,
      });
      assert.notStrictEqual(result.isError, true);
      assert.strictEqual(artifacts.length, 1);
      const attachment = artifacts[0]!.payload as T3TeamMessageWidgetAttachment;
      assert.strictEqual(attachment.widget.html, "<div>bypass</div>");
    }),
  );
});
