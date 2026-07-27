/**
 * Attachments are the author-facing replacement for `JSON.stringify` in prompts, so the
 * normalizer must accept plain objects and arrays directly, name them stably (a name is what the
 * agent sees, and a stable name is what keeps the payload — hence the argsHash — replay-stable),
 * keep an explicit `{ name, value }` pair intact, and refuse values the journal cannot record.
 */

import { describe, expect, it } from "vite-plus/test";

import {
  asNamedAttachments,
  normalizeAgentAttachments,
  renderAgentAttachments,
} from "./t3team-sdk.askAttachments.ts";
import { hashArgs } from "./t3team-sdk.canonicalJson.ts";

describe("normalizeAgentAttachments", () => {
  it("names bare values positionally and keeps explicit names", () => {
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

  it("accepts arrays and scalars as values without wrapping ceremony", () => {
    expect(normalizeAgentAttachments([[1, 2], "note"])).toEqual([
      { name: "data-1", value: [1, 2] },
      { name: "data-2", value: "note" },
    ]);
  });

  it("returns undefined for an absent or empty list, so the payload stays unchanged", () => {
    expect(normalizeAgentAttachments(undefined)).toBeUndefined();
    expect(normalizeAgentAttachments([])).toBeUndefined();
  });

  it("refuses a value the journal cannot record, naming the attachment", () => {
    expect(() => normalizeAgentAttachments([{ name: "bad", value: { when: 1n } }])).toThrow(
      /Attachment 'bad' is not serializable/,
    );
  });

  it("accepts an object whose prototype is not this realm's (the workflow sandbox's literals)", () => {
    const foreign = Object.create(null) as Record<string, unknown>;
    foreign["gate"] = "coverage";
    expect(normalizeAgentAttachments([foreign])).toEqual([
      { name: "data-1", value: { gate: "coverage" } },
    ]);
  });

  it("is replay-stable: equal inputs hash identically regardless of key order", () => {
    const a = normalizeAgentAttachments([{ id: "g1", ok: true }]);
    const b = normalizeAgentAttachments([{ ok: true, id: "g1" }]);
    expect(hashArgs(a)).toBe(hashArgs(b));
  });
});

describe("renderAgentAttachments", () => {
  it("renders one fenced JSON block per attachment", () => {
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

  it("renders nothing when there is nothing attached", () => {
    expect(renderAgentAttachments(undefined)).toBe("");
    expect(renderAgentAttachments([])).toBe("");
  });
});

describe("asNamedAttachments", () => {
  it("narrows a payload field and ignores anything that is not a named attachment", () => {
    expect(asNamedAttachments([{ name: "a", value: 1 }, "junk"])).toEqual([
      { name: "a", value: 1 },
    ]);
    expect(asNamedAttachments(undefined)).toBeUndefined();
    expect(asNamedAttachments(["junk"])).toBeUndefined();
  });
});
