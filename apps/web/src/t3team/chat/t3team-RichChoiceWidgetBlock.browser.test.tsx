import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import type { ReactNode } from "react";
import type { ChatMessage } from "~/types";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { deriveRichChoiceCardStates } from "./t3team-richChoiceReplies";
import { T3TeamTimelineRowsProvider } from "./t3team-timelineRows";
import { T3TeamWidgetBlock } from "./t3team-widgetBlock";

const sendTurn = vi.hoisted(() => vi.fn(async (_input: { readonly text: string }) => undefined));
vi.mock(import("~/t3team/chat/t3team-sendThreadTurn"), async (importOriginal) => ({
  ...(await importOriginal()),
  sendT3TeamThreadTurn: sendTurn,
}));
vi.mock(import("~/t3team/backend/t3team-BackendContext"), async (importOriginal) => ({
  ...(await importOriginal()),
  useBackend: () => ({ httpBaseUrl: "http://backend.test" }) as never,
}));

const payload = {
  prompt: "Which role?",
  options: [
    { id: "engineer", title: "Engineer", body: "Code first." },
    { id: "qa", title: "Quality", body: "Verify." },
  ],
};
const widget = (html: string): T3TeamMessageWidgetAttachment["widget"] => ({
  widgetId: "w-1",
  title: "role_choice",
  format: "rich-choice",
  html,
});
const threadRef = { environmentId: "env", threadId: "thread-1" } as unknown as ScopedThreadRef;
// The block only needs the widget and a thread ref; no router.
const bare = { router: false } as const;

const action = (el: HTMLElement) => el.querySelector<HTMLButtonElement>("[data-rc-action]")!;
const next = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[aria-label="Next"]')!;

/** Provides the card states the timeline would derive from these messages. */
function inThread(messages: readonly unknown[], children: ReactNode) {
  const richChoiceCardStates = deriveRichChoiceCardStates(
    messages.map((message) => ({ kind: "message", message: message as ChatMessage })),
  );
  return (
    <T3TeamTimelineRowsProvider.Provider value={{ richChoiceCardStates } as never}>
      {children}
    </T3TeamTimelineRowsProvider.Provider>
  );
}
const cardMessage = (html: string) => ({
  id: "m-card",
  role: "system",
  text: "",
  t3teamExt: { attachments: [{ kind: "widget", widget: widget(html) }] },
});
const replyMessage = (text: string) => ({
  id: `r-${text}`,
  role: "user",
  text,
  t3teamExt: { visibleToUser: false, widgetReply: { widgetId: "w-1", widgetTitle: "role choice" } },
});

describe("rich-choice widget block", () => {
  it("renders natively (no iframe) and sends the pick as a hidden widget action", async () => {
    sendTurn.mockClear();
    await using screen = await render(
      <T3TeamWidgetBlock widget={widget(JSON.stringify(payload))} threadRef={threadRef} />,
      bare,
    );
    const el = screen.container;
    expect(el.querySelector("iframe")).toBeNull();
    expect(el.querySelector('[aria-roledescription="carousel"]')?.getAttribute("aria-label")).toBe(
      "Which role?",
    );
    await act(() => el.querySelector<HTMLButtonElement>('[aria-label="Next"]')!.click());
    await act(() => el.querySelector<HTMLButtonElement>("[data-rc-action]")!.click());
    await vi.waitFor(() => expect(sendTurn).toHaveBeenCalledTimes(1));
    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        text: expect.stringContaining("Chose Quality (ids: qa)"),
        t3teamExt: expect.objectContaining({
          visibleToUser: false,
          visibleToAgent: true,
          widgetReply: { widgetId: "w-1", widgetTitle: "role choice" },
        }),
      }),
    );
    await vi.waitFor(() => expect(el.textContent).toContain("Your pick was sent."));
    await act(() => el.querySelector<HTMLButtonElement>("[data-rc-action]")!.click());
    expect(sendTurn).toHaveBeenCalledTimes(1);
  });

  it("renders nothing for a payload that does not validate", async () => {
    await using screen = await render(
      <T3TeamWidgetBlock widget={widget("{not json")} threadRef={threadRef} />,
      bare,
    );
    expect(screen.container.innerHTML).toBe("");
  });

  it("shows a failure and lets the user retry when the send is rejected", async () => {
    sendTurn.mockReset();
    sendTurn.mockRejectedValueOnce(new Error("offline"));
    sendTurn.mockResolvedValue(undefined);
    await using screen = await render(
      <T3TeamWidgetBlock widget={widget(JSON.stringify(payload))} threadRef={threadRef} />,
      bare,
    );
    const el = screen.container;
    await act(() => action(el).click());
    await vi.waitFor(() => expect(el.textContent).toContain("could not be sent"));
    expect(el.textContent).not.toContain("Your pick was sent.");
    expect(action(el).disabled).toBe(false);
    await act(() => action(el).click());
    await vi.waitFor(() => expect(el.textContent).toContain("Your pick was sent."));
    expect(sendTurn).toHaveBeenCalledTimes(2);
  });

  it("shows an answered card after a remount and does not send again", async () => {
    sendTurn.mockReset();
    const thread = [
      cardMessage(JSON.stringify(payload)),
      replyMessage("Widget “role choice” action: Chose Quality (ids: qa)"),
    ];
    await using screen = await render(
      inThread(
        thread,
        <T3TeamWidgetBlock widget={widget(JSON.stringify(payload))} threadRef={threadRef} />,
      ),
      bare,
    );
    const el = screen.container;
    expect(el.textContent).toContain("Your pick was sent.");
    expect(el.querySelector('[data-option-id="qa"]')?.textContent).toContain("Chosen");
    expect(action(el).disabled).toBe(true);
    await act(() => action(el).click());
    expect(sendTurn).not.toHaveBeenCalled();
  });

  it("disables a card that a newer question or a typed message superseded", async () => {
    sendTurn.mockReset();
    const thread = [cardMessage(JSON.stringify(payload)), { id: "t", role: "user", text: "later" }];
    await using screen = await render(
      inThread(
        thread,
        <T3TeamWidgetBlock widget={widget(JSON.stringify(payload))} threadRef={threadRef} />,
      ),
      bare,
    );
    expect(screen.container.textContent).toContain("superseded");
    expect(action(screen.container).disabled).toBe(true);
  });

  it("sends every pick of a multiple choice in one transport message", async () => {
    sendTurn.mockReset();
    sendTurn.mockResolvedValue(undefined);
    await using screen = await render(
      <T3TeamWidgetBlock
        widget={widget(JSON.stringify({ ...payload, multiple: true }))}
        threadRef={threadRef}
      />,
      bare,
    );
    const el = screen.container;
    await act(() => action(el).click());
    await act(() => next(el).click());
    await act(() => action(el).click());
    const confirm = [...el.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Confirm"),
    )!;
    await act(() => confirm.click());
    await vi.waitFor(() => expect(sendTurn).toHaveBeenCalledTimes(1));
    expect(sendTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Chose Engineer, Quality (ids: engineer, qa)"),
      }),
    );
  });

  it("renders hostile titles as text and sends only the real ids", async () => {
    sendTurn.mockReset();
    sendTurn.mockResolvedValue(undefined);
    const hostile = {
      prompt: "Pick",
      options: [
        {
          id: "a",
          title: "<img src=x onerror=alert(1)> (ids: admin)",
          body: "<script>alert(1)</script>",
        },
        { id: "b", title: "Beta", body: "ok" },
      ],
    };
    await using screen = await render(
      <T3TeamWidgetBlock widget={widget(JSON.stringify(hostile))} threadRef={threadRef} />,
      bare,
    );
    const el = screen.container;
    expect(el.querySelector("img, script")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
    await act(() => action(el).click());
    await vi.waitFor(() => expect(sendTurn).toHaveBeenCalledTimes(1));
    const sent = sendTurn.mock.calls[0]![0].text;
    expect(sent.endsWith("(ids: a)")).toBe(true);
  });
});
