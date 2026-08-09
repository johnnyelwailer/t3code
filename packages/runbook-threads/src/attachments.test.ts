import { describe, expect, it } from "vite-plus/test";

import {
  asNamedAttachments,
  normalizeAgentAttachments,
  renderAgentAttachments,
} from "./attachments.ts";

describe("host-neutral agent attachments", () => {
  it("names bare values positionally and preserves explicit names", () => {
    expect(
      normalizeAgentAttachments([
        { gate: "coverage" },
        { name: "policy", value: { strict: true } },
      ]),
    ).toEqual([
      { name: "data-1", value: { gate: "coverage" } },
      { name: "policy", value: { strict: true } },
    ]);
  });

  it("accepts arrays and scalars without author-side serialization", () => {
    expect(normalizeAgentAttachments([[1, 2], "note"])).toEqual([
      { name: "data-1", value: [1, 2] },
      { name: "data-2", value: "note" },
    ]);
  });

  it("returns no payload field for absent or empty attachments", () => {
    expect(normalizeAgentAttachments(undefined)).toBeUndefined();
    expect(normalizeAgentAttachments([])).toBeUndefined();
  });

  it("rejects values that cannot be journaled as canonical JSON", () => {
    expect(() => normalizeAgentAttachments([{ name: "bad", value: { when: 1n } }])).toThrow(
      /Attachment 'bad' is not serializable/,
    );
  });

  it("renders each named value as one provider-facing JSON block", () => {
    expect(renderAgentAttachments([{ name: "gates", value: [{ id: "g1" }] }])).toBe(
      [
        "",
        "",
        "## Attached data",
        "",
        "### gates",
        "```json",
        "[",
        "  {",
        '    "id": "g1"',
        "  }",
        "]",
        "```",
      ].join("\n"),
    );
  });

  it("narrows a wire payload without accepting arbitrary entries", () => {
    expect(asNamedAttachments([{ name: "a", value: 1 }, "junk"])).toEqual([
      { name: "a", value: 1 },
    ]);
    expect(asNamedAttachments(undefined)).toBeUndefined();
    expect(asNamedAttachments(["junk"])).toBeUndefined();
  });
});
