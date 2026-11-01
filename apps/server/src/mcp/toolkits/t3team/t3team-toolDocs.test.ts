import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { advertiseToolDocs, fieldDescriptionsByPath } from "./t3team-toolDocs.ts";
import { t3ToolHelpHandler } from "./t3team-toolHelpTool.ts";

const schema = {
  type: "object",
  description: "whole input",
  properties: {
    mode: { type: "string", description: "long mode explanation" },
    description: { type: "string", description: "free text" },
    nested: {
      type: "object",
      properties: { mode: { type: "string", description: "nested mode" } },
    },
    list: { type: "array", items: { type: "string", description: "item note" } },
  },
};

it("a listed tool is advertised with its minimal text and the notes its entry keeps", () => {
  const advertised = advertiseToolDocs(
    { name: "sample_tool", description: "A long essay.", inputSchema: schema },
    { sample_tool: { description: "- does it", fields: { mode: "a|b" } } },
  );
  expect(advertised.description).toBe("- does it");
  expect(advertised.inputSchema).toEqual({
    type: "object",
    properties: {
      mode: { type: "string", description: "a|b" },
      description: { type: "string" },
      nested: { type: "object", properties: { mode: { type: "string", description: "a|b" } } },
      list: { type: "array", items: { type: "string" } },
    },
  });
});

it("an unlisted tool is advertised as registered", () => {
  const advertised = advertiseToolDocs({
    name: "unlisted_tool",
    description: "As registered.",
    inputSchema: schema,
  });
  expect(advertised).toEqual({ description: "As registered.", inputSchema: schema });
});

it.effect("t3_tool_help returns the registered text, not the minimal one", () =>
  Effect.gen(function* () {
    advertiseToolDocs(
      { name: "helped_tool", description: "Original long text.", inputSchema: schema },
      { helped_tool: { description: "- short" } },
    );
    const help = yield* t3ToolHelpHandler({ tool: "helped_tool" });
    expect(help.description).toBe("Original long text.");
    expect(help.fields).toEqual({
      "(input)": "whole input",
      mode: "long mode explanation",
      description: "free text",
      "nested.mode": "nested mode",
      "list[]": "item note",
    });
    expect(fieldDescriptionsByPath(schema)["nested.mode"]).toBe("nested mode");
    const unknown = yield* Effect.flip(t3ToolHelpHandler({ tool: "no_such_tool" }));
    expect(unknown.message).toContain("no_such_tool");
  }),
);
