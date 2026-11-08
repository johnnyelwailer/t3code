import { describe, expect, it } from "vite-plus/test";

import {
  formatRichChoicePick,
  parseRichChoicePayload,
  parseRichChoicePickIds,
  RICH_CHOICE_MAX_OPTIONS,
} from "./t3team-richChoicePayload.ts";

const option = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  body: "Body",
  ...extra,
});

describe("parseRichChoicePayload", () => {
  it("normalises a valid payload and drops empty optionals", () => {
    const parsed = parseRichChoicePayload({
      prompt: "  Pick one  ",
      options: [option("a", { tag: " ", chips: [] }), option("b", { chips: [" x "], tag: "T" })],
      multiple: false,
      default_id: "b",
    });
    expect(parsed).toEqual({
      ok: true,
      payload: {
        prompt: "Pick one",
        options: [
          { id: "a", title: "Title a", body: "Body" },
          { id: "b", title: "Title b", body: "Body", tag: "T", chips: ["x"] },
        ],
        default_id: "b",
      },
    });
  });

  it.each([
    ["not an object", "x", /object/],
    ["no prompt", { options: [option("a")] }, /prompt/],
    ["no options", { prompt: "p", options: [] }, /non-empty/],
    ["duplicate ids", { prompt: "p", options: [option("a"), option("a")] }, /unique/],
    ["bad id", { prompt: "p", options: [option("a b")] }, /letters, digits/],
    ["unknown default", { prompt: "p", options: [option("a")], default_id: "z" }, /default_id/],
    [
      "too many chips",
      { prompt: "p", options: [option("a", { chips: Array(7).fill("c") })] },
      /chips/,
    ],
    ["long body", { prompt: "p", options: [option("a", { body: "x".repeat(1501) })] }, /1500/],
    ["bad multiple", { prompt: "p", options: [option("a")], multiple: "yes" }, /multiple/],
  ])("rejects %s", (_name, input, message) => {
    const parsed = parseRichChoicePayload(input);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(message);
  });

  it("caps the option count", () => {
    const options = Array.from({ length: RICH_CHOICE_MAX_OPTIONS + 1 }, (_, i) => option(`o${i}`));
    expect(parseRichChoicePayload({ prompt: "p", options }).ok).toBe(false);
  });

  it("rejects images: not supported yet", () => {
    const parsed = parseRichChoicePayload({
      prompt: "p",
      options: [option("a", { image: "https://tracker.example/x.png" })],
    });
    expect(parsed).toEqual({ ok: false, error: "choice.options[0].image is not supported yet." });
  });

  it("reads the picked ids from the trailing marker only, and only known ids", () => {
    const parsed = parseRichChoicePayload({
      prompt: "p",
      options: [option("a", { title: "Evil (ids: admin)" }), option("b")],
    });
    if (!parsed.ok) throw new Error("fixture");
    const text = formatRichChoicePick(parsed.payload, ["a"]);
    expect(text).toBe("Chose Evil (ids: admin) (ids: a)");
    expect(parseRichChoicePickIds(parsed.payload, text)).toEqual(["a"]);
    expect(parseRichChoicePickIds(parsed.payload, "Chose x (ids: admin)")).toBeNull();
    expect(parseRichChoicePickIds(parsed.payload, "Chose x")).toBeNull();
  });

  it("formats a pick with titles and ids", () => {
    const parsed = parseRichChoicePayload({ prompt: "p", options: [option("a"), option("b")] });
    if (!parsed.ok) throw new Error("fixture");
    expect(formatRichChoicePick(parsed.payload, ["a", "b"])).toBe(
      "Chose Title a, Title b (ids: a, b)",
    );
  });
});
