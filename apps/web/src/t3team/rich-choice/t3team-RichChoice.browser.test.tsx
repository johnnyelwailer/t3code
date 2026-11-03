import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { act, render } from "../../../test/render";
import { T3TeamRichChoice } from "./t3team-RichChoice";
import type { RichChoiceOption } from "./t3team-richChoice.logic";

const options: readonly RichChoiceOption[] = [
  { id: "a", title: "Alpha", tag: "A", body: "first", chips: ["one"] },
  { id: "b", title: "Beta", body: "second" },
  { id: "c", title: "Gamma", body: "third" },
];

// The carousel needs no router; `router: false` renders it bare.
const bare = { router: false } as const;

const frontId = (el: HTMLElement) =>
  el.querySelector('[data-front="true"]')?.getAttribute("data-option-id");
const action = (el: HTMLElement, id?: string) =>
  el.querySelector<HTMLButtonElement>(
    id ? `[data-option-id="${id}"] [data-rc-action]` : "[data-rc-action]",
  )!;
const dot = (el: HTMLElement, position: number) =>
  el.querySelector<HTMLButtonElement>(`[data-rc-dot="${position}"]`)!;
const viewport = (el: HTMLElement) => el.querySelector<HTMLElement>("[data-dragging]")!;
const press = (el: HTMLElement, type: string, x: number, y = 100) =>
  act(() => {
    viewport(el).dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "touch",
        button: 0,
      }),
    );
  });
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
const buttonByText = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;

describe("T3TeamRichChoice", () => {
  it("exposes a labelled carousel with one named slide and one dot per option", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={vi.fn()} />,
      bare,
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
    expect(dot(el, 0).getAttribute("aria-current")).toBe("true");
    expect(dot(el, 1).getAttribute("aria-label")).toBe("2 of 3: Beta");
    expect(el.querySelector(".motion-reduce\\:duration-150")).not.toBeNull();
  });

  it("moves the front card with arrows, keys and dots without choosing", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await act(() => el.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click());
    await vi.waitFor(() => expect(frontId(el)).toBe("b"));
    await key(el.querySelector('[aria-roledescription="carousel"]')!, "End");
    await vi.waitFor(() => expect(frontId(el)).toBe("c"));
    expect(el.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.disabled).toBe(true);
    await act(() => dot(el, 0).click());
    await vi.waitFor(() => expect(frontId(el)).toBe("a"));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("keeps keyboard focus on the control that moved, and Enter chooses", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await act(() => action(el).focus());
    await key(action(el), "ArrowRight");
    await vi.waitFor(() => expect(document.activeElement).toBe(action(el, "b")));
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(onChoose).toHaveBeenCalledWith(["b"]));

    await act(() => dot(el, 1).focus());
    await key(dot(el, 1), "ArrowRight");
    await vi.waitFor(() => expect(document.activeElement).toBe(dot(el, 2)));
    expect(frontId(el)).toBe("c");
  });

  it("brings a peeking card forward on click, focuses its action, and chooses only through it", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await act(() =>
      el
        .querySelector<HTMLButtonElement>('[data-option-id="b"] button[aria-label^="Show"]')!
        .click(),
    );
    await vi.waitFor(() => expect(frontId(el)).toBe("b"));
    await vi.waitFor(() => expect(document.activeElement).toBe(action(el, "b")));
    expect(onChoose).not.toHaveBeenCalled();
    await act(() => action(el).click());
    expect(onChoose).toHaveBeenCalledWith(["b"]);
  });

  it("turns the page on a drag, never chooses, and swallows only the click that follows it", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await press(el, "pointerdown", 300);
    await press(el, "pointermove", 150);
    await vi.waitFor(() => expect(viewport(el).dataset.dragging).toBe("true"));
    await press(el, "pointerup", 150);
    await vi.waitFor(() => expect(frontId(el)).toBe("b"));
    await act(() => action(el).click());
    expect(onChoose).not.toHaveBeenCalled();
    await act(() => action(el).click());
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it("changes nothing when the gesture is cancelled, and the next click still works", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await press(el, "pointerdown", 300);
    await press(el, "pointermove", 100);
    await press(el, "pointercancel", 100);
    await vi.waitFor(() => expect(viewport(el).dataset.dragging).toBe("false"));
    expect(frontId(el)).toBe("a");
    await act(() => action(el).click());
    expect(onChoose).toHaveBeenCalledWith(["a"]);
  });

  it("hands a mostly vertical gesture back to the page", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} onChoose={vi.fn()} />,
      bare,
    );
    const el = screen.container;
    await press(el, "pointerdown", 300, 100);
    await press(el, "pointermove", 305, 160);
    await press(el, "pointermove", 100, 165);
    await press(el, "pointerup", 100, 165);
    expect(viewport(el).dataset.dragging).toBe("false");
    expect(frontId(el)).toBe("a");
  });

  it("marks the saved setting, follows it when it changes, and drops ids that are gone", async () => {
    await using screen = await render(
      <T3TeamRichChoice
        prompt="Pick one"
        options={options}
        selectedIds={["a"]}
        onChoose={vi.fn()}
      />,
      bare,
    );
    const el = screen.container;
    const chosen = (id: string) =>
      el.querySelector(`[data-option-id="${id}"]`)?.textContent?.includes("Chosen");
    expect(chosen("a")).toBe(true);
    await screen.rerender(
      <T3TeamRichChoice
        prompt="Pick one"
        options={options}
        selectedIds={["b"]}
        onChoose={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(chosen("b")).toBe(true));
    expect(chosen("a")).toBe(false);
    await screen.rerender(
      <T3TeamRichChoice
        prompt="Pick one"
        options={options.slice(2)}
        selectedIds={["b"]}
        onChoose={vi.fn()}
      />,
    );
    await vi.waitFor(() => expect(el.textContent).not.toContain("Chosen"));
  });

  it("opens on the default option", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick one" options={options} defaultId="c" onChoose={vi.fn()} />,
      bare,
    );
    expect(frontId(screen.container)).toBe("c");
  });

  it("collects several picks and returns them on confirm", async () => {
    const onChoose = vi.fn();
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick" options={options} multiple onChoose={onChoose} />,
      bare,
    );
    const el = screen.container;
    await act(() => action(el).click());
    await act(() => el.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click());
    await act(() => action(el).click());
    await vi.waitFor(() => expect(buttonByText(el, "Confirm").textContent).toBe("Confirm (2)"));
    await act(() => buttonByText(el, "Confirm").click());
    expect(onChoose).toHaveBeenCalledWith(["a", "b"]);
  });

  it("renders nothing for an empty option list", async () => {
    await using screen = await render(
      <T3TeamRichChoice prompt="Pick" options={[]} onChoose={vi.fn()} />,
      bare,
    );
    expect(screen.container.innerHTML).toBe("");
  });
});
