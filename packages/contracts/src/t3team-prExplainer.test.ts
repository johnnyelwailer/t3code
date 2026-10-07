import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamPrExplainer, T3TeamPrExplainerAnchor } from "./t3team-prExplainer.ts";

const decode = Schema.decodeUnknownSync(T3TeamPrExplainer);

const explainer = {
  version: 1,
  pullRequest: { number: 412, title: "Cache digest PR reads" },
  headSha: "9f3c2a1",
  generatedAt: "2026-10-07T08:00:00.000Z",
  summary: "Reads PRs from a cache.",
  risk: "low",
  reviewMinutes: 12,
  map: {
    nodes: [
      { id: "loader", label: "Loader", role: "service", col: 0, row: 0 },
      { id: "cache", label: "Cache", role: "store", col: 1, row: 0, since: "s2" },
    ],
    edges: [{ id: "e", from: "loader", to: "cache", style: "async", since: "s2" }],
  },
  steps: [
    {
      id: "s2",
      kind: "check",
      caption: "Check: the cache key has no viewer.",
      visual: { kind: "map", warn: ["cache"] },
      touches: { nodes: ["cache"] },
      diffs: [
        {
          id: "d",
          path: "prCache.ts",
          status: "added",
          hunk: { oldStart: 0, oldLines: 0, newStart: 17, newLines: 1 },
          lines: [
            {
              kind: "add",
              oldLine: null,
              newLine: 17,
              content: "const key = `${host}/${repo}`;",
              highlights: [{ start: 12, end: 30 }],
              annotation: { tone: "warning", text: "add viewer id" },
            },
          ],
        },
      ],
    },
  ],
};

describe("T3TeamPrExplainer", () => {
  it("decodes an explainer with a map frame, diff slice and annotation", () => {
    expect(decode(explainer).steps[0]?.diffs[0]?.lines[0]?.annotation?.tone).toBe("warning");
  });

  it("decodes every visual modality", () => {
    const visuals = [
      { kind: "none" },
      { kind: "shape", name: "T", fields: [{ name: "unit", type: "string", change: "added" }] },
      {
        kind: "sequence",
        actors: [{ id: "a", label: "A" }],
        messages: [{ id: "m", from: "a", to: "a", label: "x", style: "call", change: "removed" }],
      },
      {
        kind: "uiCompare",
        mode: "slider",
        before: { src: "data:,", alt: "before" },
        after: { src: "data:,", alt: "after" },
      },
    ];
    for (const visual of visuals) {
      const step = { ...explainer.steps[0], visual };
      expect(decode({ ...explainer, steps: [step] }).steps[0]?.visual.kind).toBe(visual.kind);
    }
  });

  it("rejects an unknown step kind, risk and visual", () => {
    const step = explainer.steps[0];
    expect(() => decode({ ...explainer, risk: "none" })).toThrow();
    expect(() => decode({ ...explainer, steps: [{ ...step, kind: "story" }] })).toThrow();
    expect(() =>
      decode({ ...explainer, steps: [{ ...step, visual: { kind: "html" } }] }),
    ).toThrow();
  });
});

describe("T3TeamPrExplainerAnchor", () => {
  const decodeAnchor = Schema.decodeUnknownSync(T3TeamPrExplainerAnchor);

  it("decodes a diff line range and a text selection", () => {
    expect(
      decodeAnchor({
        stepId: "s2",
        target: { kind: "diffLine", sliceId: "d", start: 0, end: 2 },
        quote: "const key",
      }).target.kind,
    ).toBe("diffLine");
    expect(
      decodeAnchor({
        stepId: "s2",
        target: { kind: "textSelection", within: "caption" },
        quote: "no viewer",
      }).target.kind,
    ).toBe("textSelection");
  });

  it("rejects an unknown target", () => {
    expect(() => decodeAnchor({ stepId: "s2", target: { kind: "page" }, quote: "" })).toThrow();
  });
});
