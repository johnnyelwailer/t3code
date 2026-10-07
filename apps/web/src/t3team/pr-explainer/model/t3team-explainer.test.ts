import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  T3TeamExplainer,
  T3TeamExplainerAnchor,
  validateT3TeamExplainer,
} from "./t3team-explainer";

const decode = Schema.decodeUnknownSync(T3TeamExplainer);
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const explainer = {
  version: 2,
  subject: { kind: "pr", number: 412, title: "Cache digest PR reads" },
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
    { id: "s1", kind: "context", caption: "Before: the loader waits.", blocks: [] },
    {
      id: "s2",
      kind: "check",
      label: "Key",
      caption: "Check: the cache key has no viewer.",
      blocks: [
        { id: "m", type: "map", warn: ["cache"], touches: { nodes: ["cache"] } },
        { id: "c", type: "callout", tone: "warn", text: "Add the viewer id." },
        {
          id: "d",
          type: "diff",
          path: "prCache.ts",
          status: "added",
          newStart: 17,
          lines: [
            {
              kind: "add",
              content: "const key = `${host}/${repo}`;",
              highlight: ["`${host}/${repo}`"],
              annotation: { tone: "warning", text: "add viewer id" },
            },
          ],
        },
      ],
    },
  ],
};

const withBlocks = (blocks: ReadonlyArray<unknown>) => ({
  ...explainer,
  steps: [explainer.steps[0], { ...explainer.steps[1], blocks }],
});

describe("T3TeamExplainer", () => {
  it("decodes a step of blocks and validates clean", () => {
    const decoded = decode(explainer);
    expect(decoded.steps[1]?.blocks.map((block) => block.type)).toEqual(["map", "callout", "diff"]);
    expect(validateT3TeamExplainer(decoded)).toEqual([]);
  });

  it("decodes a concept with no PR, no revision and no map", () => {
    const concept = {
      version: 2,
      subject: { kind: "concept", title: "How the outbox works" },
      generatedAt: "2026-10-07T08:00:00.000Z",
      summary: "Effects run after the commit.",
      steps: [
        {
          id: "c1",
          kind: "context",
          caption: "Commands decide events.",
          blocks: [
            { id: "md", type: "markdown", text: "**Pure** decisions." },
            { id: "t", type: "table", columns: ["a"], rows: [["1"]] },
            { id: "i", type: "image", src: PNG, alt: "diagram" },
          ],
        },
      ],
    };
    expect(decode(concept).subject.kind).toBe("concept");
  });

  it("turns an unknown block type into an unsupported block instead of failing", () => {
    const decoded = decode(withBlocks([{ id: "x", type: "hologram", layout: "aside" }]));
    expect(decoded.steps[1]?.blocks[0]).toEqual({
      id: "x",
      type: "unsupported",
      sourceType: "hologram",
      reason: "unknownType",
      layout: "aside",
    });
    expect(validateT3TeamExplainer(decoded)[0]?.code).toBe("unsupportedBlock");
  });

  it("isolates a known block with bad fields to that block", () => {
    const decoded = decode(withBlocks([{ id: "c", type: "callout", tone: "loud" }]));
    expect(decoded.steps[1]?.blocks[0]).toMatchObject({ type: "unsupported", reason: "invalid" });
  });

  it("only accepts attachment ids and small inline images, never a remote URL", () => {
    const image = (src: string) =>
      decode(withBlocks([{ id: "i", type: "image", src, alt: "x" }])).steps[1]?.blocks[0]?.type;
    expect(image(PNG)).toBe("image");
    expect(image("attachment:shot-1")).toBe("image");
    expect(image("https://evil.example/pixel.png?u=me")).toBe("unsupported");
    expect(image("data:image/svg+xml;base64,PHN2Zz4=")).toBe("unsupported");
    expect(image(`data:image/png;base64,${"A".repeat(210_000)}`)).toBe("unsupported");
  });

  it("does not reject long text: it is cut at render", () => {
    const caption = "word ".repeat(200).trim();
    expect(decode({ ...explainer, summary: caption }).summary).toHaveLength(caption.length);
  });
});

describe("validateT3TeamExplainer", () => {
  const codes = (input: unknown) => validateT3TeamExplainer(decode(input)).map((issue) => issue);

  it("reports unresolved refs with a repairable path", () => {
    const broken = {
      ...withBlocks([{ id: "m", type: "map", flow: ["nope"], warn: ["ghost"] }]),
      map: {
        nodes: [{ id: "a", label: "A", role: "ui", col: 0, row: 0, since: "s9" }],
        edges: [{ id: "e", from: "a", to: "b" }],
      },
    };
    expect(codes(broken).map((issue) => [issue.code, issue.path])).toEqual([
      ["unknownStep", "map.nodes[0].since"],
      ["unknownNode", "map.edges[0].to"],
      ["unknownEdge", "steps[1].blocks[0].flow[0]"],
      ["unknownNode", "steps[1].blocks[0].warn[0]"],
    ]);
  });

  it("reports duplicate ids and a part removed before it appears", () => {
    const broken = {
      ...withBlocks([
        { id: "x", type: "markdown", text: "a" },
        { id: "x", type: "markdown", text: "b" },
      ]),
      map: {
        nodes: [{ id: "a", label: "A", role: "ui", col: 0, row: 0, since: "s2", removedAt: "s1" }],
        edges: [],
      },
    };
    expect(codes(broken).map((issue) => issue.code)).toEqual(["removedBeforeSince", "duplicateId"]);
  });

  it("flags a highlight that is not in its line", () => {
    const issues = codes(
      withBlocks([
        {
          id: "d",
          type: "diff",
          path: "a.ts",
          status: "modified",
          newStart: 1,
          lines: [{ kind: "add", content: "const a = 1;", highlight: ["b"] }],
        },
      ]),
    );
    expect(issues[0]).toMatchObject({ severity: "warning", code: "highlightNotFound" });
  });
});

describe("T3TeamExplainerAnchor", () => {
  const decodeAnchor = Schema.decodeUnknownSync(T3TeamExplainerAnchor);

  it("requires the block for a selection inside a block", () => {
    expect(
      decodeAnchor({ stepId: "s2", target: { kind: "blockText", blockId: "d" }, quote: "key" })
        .target.kind,
    ).toBe("blockText");
    expect(() =>
      decodeAnchor({ stepId: "s2", target: { kind: "blockText" }, quote: "key" }),
    ).toThrow();
  });

  it("carries a video timestamp", () => {
    const anchor = decodeAnchor({
      stepId: "s2",
      target: { kind: "block", blockId: "v", atSeconds: 4.5 },
      quote: "",
    });
    expect(anchor.target).toMatchObject({ atSeconds: 4.5 });
  });
});
