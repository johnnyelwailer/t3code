import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { T3TeamWidgetBlock } from "./t3team-widgetBlock";

const sendTurn = vi.hoisted(() => vi.fn(async () => undefined));
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
});
