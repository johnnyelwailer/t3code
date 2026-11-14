import { withT3TeamMessageExtContext } from "@t3tools/contracts";
import { buildT3TeamWidgetPromptTransport } from "@t3tools/shared/t3team-widgetPromptTransport";
import { describe, expect, it } from "vite-plus/test";

import { appendPendingThreadMessages } from "../features/threads/pending-thread-feed";
import { withoutHiddenPendingRows } from "./t3team-hiddenPending";

const transport = buildT3TeamWidgetPromptTransport({
  widgetId: "w1",
  widgetTitle: "pick",
  text: "Chose Alpha (ids: a)",
});

const queued = (messageId: string, text: string, context?: unknown) =>
  ({
    environmentId: "env",
    threadId: "t",
    messageId,
    commandId: `c-${messageId}`,
    text,
    context,
    attachments: [],
    createdAt: "2026-11-01T10:00:00.000Z",
  }) as never;

describe("withoutHiddenPendingRows", () => {
  it("hides a queued widget action message and keeps a typed one", () => {
    const rows = appendPendingThreadMessages(
      [],
      [],
      [
        queued("m-pick", transport.text, withT3TeamMessageExtContext(transport.t3teamExt)),
        queued("m-typed", "hello there"),
      ],
    );
    expect(rows.map((row) => row.id)).toEqual(["m-pick", "m-typed"]);
    expect(withoutHiddenPendingRows(rows).map((row) => row.id)).toEqual(["m-typed"]);
  });

  it("returns the same array when nothing is hidden, and passes non-message rows through", () => {
    const rows = appendPendingThreadMessages([], [], [queued("m-typed", "hello")]);
    expect(withoutHiddenPendingRows(rows)).toBe(rows);
    const other = [{ type: "thinking", id: "t" }] as const;
    expect(withoutHiddenPendingRows(other)).toBe(other);
  });
});
