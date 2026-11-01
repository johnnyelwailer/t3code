import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

type Props = Record<string, unknown> & { children?: ReactNode };
type CarouselProps = {
  readonly disabled: boolean;
  readonly selectedIds: ReadonlyArray<string>;
  readonly onChoose: (ids: ReadonlyArray<string>) => void;
};

vi.unmock("./t3team-RichChoiceFeedRow");
vi.mock("react-native", () => ({
  View: ({ children }: Props) => <div>{children}</div>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children, accessibilityRole }: Props) => (
    <span role={accessibilityRole as string}>{children}</span>
  ),
}));
vi.mock("../../state/t3team-sendRichChoicePick", () => ({ sendT3TeamRichChoicePick: vi.fn() }));
vi.mock("./t3team-RichChoiceCarousel", () => ({
  T3TeamRichChoiceCarousel: ({ disabled, selectedIds, onChoose }: CarouselProps) => (
    <button
      type="button"
      data-picked={selectedIds.join(",")}
      disabled={disabled}
      onClick={() => onChoose(["a"])}
    >
      carousel-choose
    </button>
  ),
}));

import type { T3TeamRichChoiceFeedEntry } from "../../lib/t3team-richChoiceFeed";
import { richChoiceNote, T3TeamRichChoiceFeedRow } from "./t3team-RichChoiceFeedRow";

const entry = (state: T3TeamRichChoiceFeedEntry["state"]): T3TeamRichChoiceFeedEntry => ({
  type: "t3team-rich-choice",
  id: "t3team-rich-choice:w1",
  createdAt: "2026-11-01T10:00:00.000Z",
  runId: null,
  widgetId: "w1",
  title: "pick_a_role",
  payload: { prompt: "Pick a role", options: [{ id: "a", title: "Alpha", body: "b" }] },
  state,
});

const mounted: Array<() => void> = [];
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
});

function mount(state: T3TeamRichChoiceFeedEntry["state"], send = vi.fn()) {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push(() => act(() => root.unmount()));
  act(() =>
    root.render(
      <T3TeamRichChoiceFeedRow
        environmentId={"env-1" as never}
        threadId={"thread-1" as never}
        entry={entry(state)}
        send={send}
      />,
    ),
  );
  const choose = () => container.querySelector<HTMLButtonElement>("button")!;
  return { container, send, choose };
}

describe("T3TeamRichChoiceFeedRow", () => {
  it("shows the prompt and sends the pick with the card's identity", async () => {
    const view = mount({ status: "open" }, vi.fn().mockResolvedValue(undefined));
    expect(view.container.textContent).toContain("Pick a role");
    await act(async () => view.choose().click());
    expect(view.send).toHaveBeenCalledWith({
      environmentId: "env-1",
      threadId: "thread-1",
      widgetId: "w1",
      widgetTitle: "pick_a_role",
      payload: entry({ status: "open" }).payload,
      pickedIds: ["a"],
    });
  });

  it("locks while saving and says queued, not sent, once the pick is saved", async () => {
    let resolve!: () => void;
    const view = mount(
      { status: "open" },
      vi.fn(() => new Promise<void>((done) => (resolve = done))),
    );
    await act(async () => view.choose().click());
    expect(view.choose().disabled).toBe(true);
    expect(view.container.textContent).toContain("Saving your pick…");
    await act(async () => resolve());
    expect(view.container.textContent).toContain("Your pick is queued.");
    expect(view.container.textContent).not.toContain("Your pick was sent.");
    expect(view.choose().disabled).toBe(true);
    expect(view.choose().dataset.picked).toBe("a");
    await act(async () => view.choose().click());
    expect(view.send).toHaveBeenCalledTimes(1);
  });

  it("shows a failure when the send is rejected and allows a retry", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const view = mount({ status: "open" }, send);
    await act(async () => view.choose().click());
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
      "Your pick could not be sent. Try again.",
    );
    expect(view.choose().disabled).toBe(false);
    await act(async () => view.choose().click());
    expect(send).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain("Your pick is queued.");
  });

  it("is locked and shows the pick when the thread says it was answered", () => {
    const view = mount({ status: "answered", pickedIds: ["a"] });
    expect(view.choose().disabled).toBe(true);
    expect(view.choose().dataset.picked).toBe("a");
    expect(view.container.textContent).toContain("Your pick was sent.");
  });

  it("stays locked and queued after a remount while the pick is still in the outbox", () => {
    const view = mount({ status: "queued", pickedIds: ["a"] });
    expect(view.choose().disabled).toBe(true);
    expect(view.choose().dataset.picked).toBe("a");
    expect(view.container.textContent).toContain("Your pick is queued.");
    expect(view.container.textContent).not.toContain("Your pick was sent.");
  });

  it("sends once when the card is tapped twice before it re-renders", async () => {
    const send = vi.fn(() => new Promise<void>(() => {}));
    const view = mount({ status: "open" }, send);
    await act(async () => {
      view.choose().click();
      view.choose().click();
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("is locked and says so when superseded", () => {
    const view = mount({ status: "stale" });
    expect(view.choose().disabled).toBe(true);
    expect(view.container.textContent).toContain("This question was superseded.");
  });

  it("has no note while open", () => {
    expect(richChoiceNote(false, false, false, { status: "idle" })).toBeNull();
  });
});
