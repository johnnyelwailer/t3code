/**
 * The exact string that reached the user as one run-on sentence.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vite-plus/test";

import { parseT3TeamQuestionBlocks } from "~/t3team/chat/t3team-workflowQuestionBlocks";
import { describeT3TeamShapeCapability } from "~/t3team/chat/t3team-messageShapeCardCapabilities";

const LIVE_QUESTION = [
  "Rewrite the description of NXAI-8 with these changes?",
  "",
  "Help me define how an agent should work with a developer",
  "",
  "Confirm, or reply with what to do instead.",
].join("\n");

describe("parseT3TeamQuestionBlocks", () => {
  it("keeps the user's note out of the workflow's sentences", () => {
    const blocks = parseT3TeamQuestionBlocks(LIVE_QUESTION);

    expect(blocks).toEqual([
      { kind: "prose", lines: ["Rewrite the description of NXAI-8 with these changes?"] },
      { kind: "quoted", lines: ["Help me define how an agent should work with a developer"] },
      { kind: "prose", lines: ["Confirm, or reply with what to do instead."] },
    ]);
    // The regression: the note must never end up inside the framing sentence.
    expect(blocks[0]?.lines.join(" ")).not.toContain("Help me define");
    expect(blocks[1]?.lines.join(" ")).not.toContain("Confirm, or reply");
  });

  it("keeps several notes as separate items rather than one paragraph", () => {
    const blocks = parseT3TeamQuestionBlocks(
      'Rewrite?\n\nOn "the description": add criteria\nOn "the description": drop changelog\n\nConfirm.',
    );

    expect(blocks[1]).toEqual({
      kind: "quoted",
      lines: ['On "the description": add criteria', 'On "the description": drop changelog'],
    });
  });

  it("quotes nothing when there is no sandwiched material", () => {
    expect(parseT3TeamQuestionBlocks("What should change in the description?")).toEqual([
      { kind: "prose", lines: ["What should change in the description?"] },
    ]);
    expect(
      parseT3TeamQuestionBlocks("What should change?\n\nReply with anything.").every(
        (block) => block.kind === "prose",
      ),
    ).toBe(true);
  });

  it("survives ragged whitespace and an empty question", () => {
    expect(parseT3TeamQuestionBlocks("A?\n \n\nB\n\n \nC.").map((block) => block.kind)).toEqual([
      "prose",
      "quoted",
      "prose",
    ]);
    expect(parseT3TeamQuestionBlocks("   ")).toEqual([]);
  });
});

describe("describeT3TeamShapeCapability", () => {
  it("gives tool groups a human label instead of the raw permission id", () => {
    const described = describeT3TeamShapeCapability({
      kind: "group",
      id: "mutation.draft",
    } as never);

    expect(described.label).toBe("Propose changes you review");
    expect(described.description).toContain("without your approval");
    expect(described.label).not.toContain("mutation.draft");
  });

  it("lets an author-declared label win over the table", () => {
    expect(
      describeT3TeamShapeCapability({
        kind: "group",
        id: "mutation.draft",
        label: "Draft edits for this ticket",
      } as never).label,
    ).toBe("Draft edits for this ticket");
  });

  it("falls back to the id only for a group nobody has named", () => {
    expect(describeT3TeamShapeCapability({ kind: "group", id: "custom.thing" } as never)).toEqual({
      label: "custom.thing",
      description: undefined,
    });
  });

  it("still labels engine features", () => {
    expect(describeT3TeamShapeCapability({ kind: "feature", id: "user" } as never).label).toBe(
      "Ask & notify you",
    );
  });
});
