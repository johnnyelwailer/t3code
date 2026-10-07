import { describe, expect, it } from "vite-plus/test";

import { backendExplainer, backendThreads } from "./stories/t3team-explainerBackend.fixtures";
import {
  describeExplainerAnchor,
  explainerAnchorKey,
  explainerAnchorSection,
} from "./t3team-explainerAnchor";
import { buildExplainerAgentSelection } from "./t3team-explainerHandoff";
import { partitionExplainerThreads } from "./t3team-explainerThreads";

const keyLine = {
  stepId: "s5",
  target: { kind: "diffLines" as const, blockId: "s5-key", start: 2, end: 3 },
  quote: "  const key = `${host}/${repo}`;",
};

describe("explainer anchors", () => {
  it("names a diff range by file and derived line number", () => {
    expect(describeExplainerAnchor(backendExplainer, keyLine)).toBe("prCache.ts L18");
  });

  it("draws a thread under the block it points into", () => {
    expect(
      explainerAnchorSection({
        stepId: "s5",
        target: { kind: "blockText", blockId: "s5-key" },
        quote: "host",
      }),
    ).toBe("block:s5-key");
    expect(
      explainerAnchorSection({ stepId: "s5", target: { kind: "captionText" }, quote: "" }),
    ).toBe("caption");
  });

  it("keys a spot by block and the whole quote", () => {
    const selection = (blockId: string, quote: string) =>
      explainerAnchorKey({ stepId: "s5", target: { kind: "blockText", blockId }, quote });
    const long = "x".repeat(60);
    expect(selection("a", `${long}1`)).not.toBe(selection("a", `${long}2`));
    expect(selection("a", "same")).not.toBe(selection("b", "same"));
    expect(selection("a", "same")).toBe(selection("a", "same"));
  });

  it("never names a removed step as 'Step ?'", () => {
    expect(
      describeExplainerAnchor(backendExplainer, {
        stepId: "gone",
        target: { kind: "caption" },
        quote: "",
      }),
    ).toBe("A removed step");
  });

  it("names a video moment", () => {
    expect(
      describeExplainerAnchor(backendExplainer, {
        stepId: "s1",
        target: { kind: "block", blockId: "s1-map", atSeconds: 75.4 },
        quote: "",
      }),
    ).toBe("Step 1 video at 1:15");
  });
});

describe("explainer threads", () => {
  it("sets apart threads from another revision or a removed step, keeping them all", () => {
    const { current, outdated } = partitionExplainerThreads(backendExplainer, backendThreads);
    expect(current.map((thread) => thread.id)).toEqual(["t1", "t2"]);
    expect(outdated.map((thread) => thread.id)).toEqual(["t3", "t4"]);
  });

  it("outdates a line range past the end of its block", () => {
    const thread = {
      ...backendThreads[0]!,
      anchor: { ...keyLine, target: { ...keyLine.target, end: 40 } },
    };
    expect(partitionExplainerThreads(backendExplainer, [thread]).outdated).toHaveLength(1);
  });
});

describe("buildExplainerAgentSelection", () => {
  it("hands a diff range over in the PR panel's selection shape", () => {
    const selection = buildExplainerAgentSelection({
      explainer: backendExplainer,
      anchor: keyLine,
      request: "Should the key include the viewer?",
    });
    expect(selection.comment).toMatchObject({
      sectionId: "pull-request:412",
      sectionTitle: "PR #412 explainer",
      filePath: "apps/web/src/mywork/prCache.ts",
      rangeLabel: "prCache.ts L18",
      fenceLanguage: "diff",
    });
    expect(selection.comment.diff).toBe("@@ -0,0 +18,1 @@\n+  const key = `${host}/${repo}`;");
  });

  it("names the older commit when the explainer is stale", () => {
    const selection = buildExplainerAgentSelection({
      explainer: backendExplainer,
      anchor: keyLine,
      request: "",
      staleSha: "9f3c2a1e7d",
    });
    expect(selection.comment.sectionTitle).toBe(
      "PR #412 explainer (written at 9f3c2a1, an older commit)",
    );
  });
});
