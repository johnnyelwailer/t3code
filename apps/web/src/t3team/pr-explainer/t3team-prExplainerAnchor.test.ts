import { describe, expect, it } from "vite-plus/test";

import { backendExplainer } from "~/t3team/stories/t3team-prExplainerBackend.fixtures";

import {
  buildPrExplainerAgentSelection,
  describePrExplainerAnchor,
  prExplainerAnchorKey,
  prExplainerAnchorSection,
} from "./t3team-prExplainerAnchor";

const keyLine = {
  stepId: "s5",
  target: { kind: "diffLine" as const, sliceId: "s5-key", start: 2, end: 2 },
  quote: "  const key = `${host}/${repo}`;",
};

describe("PR explainer anchors", () => {
  it("names a diff line by file and line number", () => {
    expect(describePrExplainerAnchor(backendExplainer, keyLine)).toBe("prCache.ts L18");
  });

  it("places selections in the part they were taken from", () => {
    expect(
      prExplainerAnchorSection({
        stepId: "s5",
        target: { kind: "textSelection", within: "diff", sliceId: "s5-key" },
        quote: "host",
      }),
    ).toBe("diff:s5-key");
    expect(
      prExplainerAnchorSection({
        stepId: "s5",
        target: { kind: "mapNode", nodeId: "cache" },
        quote: "",
      }),
    ).toBe("visual");
  });

  it("gives one key per spot, so a second question joins the thread", () => {
    expect(prExplainerAnchorKey(keyLine)).toBe(
      prExplainerAnchorKey({ ...keyLine, quote: "other" }),
    );
    expect(prExplainerAnchorKey(keyLine)).not.toBe(
      prExplainerAnchorKey({ ...keyLine, target: { ...keyLine.target, end: 3 } }),
    );
  });

  it("names a map edge by the nodes it joins", () => {
    expect(
      describePrExplainerAnchor(backendExplainer, {
        stepId: "s3",
        target: { kind: "mapEdge", edgeId: "loader-cache" },
        quote: "read",
      }),
    ).toBe("Loader → PR cache");
  });

  it("hands a diff range to the agent in the PR panel's selection shape", () => {
    const selection = buildPrExplainerAgentSelection({
      explainer: backendExplainer,
      anchor: keyLine,
      request: "Should the key include the viewer?",
    });
    expect(selection.request).toBe("Should the key include the viewer?");
    expect(selection.comment).toMatchObject({
      sectionId: "pull-request:412",
      filePath: "apps/web/src/mywork/prCache.ts",
      rangeLabel: "prCache.ts L18",
      fenceLanguage: "diff",
    });
    expect(selection.comment.diff).toBe("@@ -0,0 +18,1 @@\n+  const key = `${host}/${repo}`;");
  });

  it("hands a map node over with the step caption as context", () => {
    const selection = buildPrExplainerAgentSelection({
      explainer: backendExplainer,
      anchor: { stepId: "s5", target: { kind: "mapNode", nodeId: "cache" }, quote: "PR cache" },
      request: "",
    });
    expect(selection.comment.rangeLabel).toBe("PR cache");
    expect(selection.comment.diff).toContain("Explainer step: Check: the cache key has no viewer.");
  });
});
