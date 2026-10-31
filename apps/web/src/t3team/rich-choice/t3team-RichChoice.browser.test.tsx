import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { T3TeamRichChoice } from "./t3team-RichChoice";
import type { RichChoiceOption } from "./t3team-richChoice.logic";

const options: readonly RichChoiceOption[] = [
  { id: "a", title: "Alpha", tag: "A", body: "first", chips: ["one"] },
  { id: "b", title: "Beta", body: "second" },
  { id: "c", title: "Gamma", body: "third" },
];

const frontId = (el: HTMLElement) =>
  el.querySelector('[data-front="true"]')?.getAttribute("data-option-id");
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;

describe("T3TeamRichChoice", () => {
  it("exposes a labelled carousel with one named slide per option", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={vi.fn()} />,
      { router: false },
    );
    const el = screen.container;
    expect(el.querySelector('[aria-roledescription="carousel"]')?.getAttribute("aria-label")).toBe(
      "Pick one",
    );
    expect(
      [...el.querySelectorAll('[aria-roledescription="slide"]')].map((s) =>
        s.getAttribute("aria-label"),
      ),
    ).toEqual(["1 of 3: Alpha", "2 of 3: Beta", "3 of 3: Gamma"]);
    expect(el.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(el.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("aria-label")).toBe(
      "1 of 3: Alpha",
    );
  });

  it("moves the front card with arrows, keys and dots without choosing", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      { router: false },
    );
    const el = screen.container;
    await act(() => (el.querySelector('[aria-label="Next"]') as HTMLButtonElement).click());
    expect(frontId(el)).toBe("b");
    await act(() => {
      el.querySelector('[aria-roledescription="carousel"]')!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "End", bubbles: true }),
      );
    });
    expect(frontId(el)).toBe("c");
    expect((el.querySelector('[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(true);
    await act(() => (el.querySelectorAll('[role="tab"]')[0] as HTMLButtonElement).click());
    expect(frontId(el)).toBe("a");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("brings a peeking card forward on click and chooses only through the action", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      { router: false },
    );
    const el = screen.container;
    await act(() =>
      (
        el.querySelector('[data-option-id="b"] button[aria-label^="Show"]') as HTMLButtonElement
      ).click(),
    );
    expect(frontId(el)).toBe("b");
    expect(onChoose).not.toHaveBeenCalled();
    await act(() => button(el, "Choose this").click());
    expect(onChoose).toHaveBeenCalledWith(["b"]);
  });

  it("starts on the default option and marks the current setting", async () => {
    await using screen = await render(
      <T3TeamRichChoice
        prompt="Pick one"
        options={options}
        defaultId="c"
        selectedIds={["c"]}
        onChoose={vi.fn()}
      />,
      { router: false },
    );
    expect(frontId(screen.container)).toBe("c");
    expect(screen.container.querySelector('[data-option-id="c"]')?.textContent).toContain("Chosen");
  });

  it("collects several picks and returns them on confirm", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick" options={options} multiple onChoose={onChoose} />,
      { router: false },
    );
    const el = screen.container;
    await act(() => button(el, "Choose this").click());
    await act(() => (el.querySelector('[aria-label="Next"]') as HTMLButtonElement).click());
    await act(() => button(el, "Choose this").click());
    expect(button(el, "Confirm").textContent).toBe("Confirm (2)");
    await act(() => button(el, "Confirm").click());
    expect(onChoose).toHaveBeenCalledWith(["a", "b"]);
  });

  it("renders nothing for an empty option list", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick" options={[]} onChoose={vi.fn()} />,
      { router: false },
    );
    expect(screen.container.innerHTML).toBe("");
  });
});
