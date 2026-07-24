// @vitest-environment jsdom
import { MessageId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("~/components/ChatMarkdown", () => ({
  default: ({ text }: { text: string }) => <div data-chat-markdown="true">{text}</div>,
}));

import { T3TeamActorTimelineRow } from "./t3team-ActorTimelineRow";

describe("T3TeamActorTimelineRow", () => {
  it("starts collapsed with a concise sender preview and Markdown detail body", () => {
    const markup = renderToStaticMarkup(
      <T3TeamActorTimelineRow
        message={{
          id: MessageId.make("actor-message-1"),
          role: "actor",
          text: "## Result\n\n- Fixed **two** issues.",
          streaming: false,
          createdAt: "2026-07-19T12:00:00.000Z",
          updatedAt: "2026-07-19T12:00:00.000Z",
          turnId: null,
          t3teamExt: {
            visibleToUser: true,
            displayText: "Fixed two issues and verified the result.",
            author: {
              kind: "actor",
              threadId: "child-1",
              projectId: "project-1",
              title: "Accessibility review",
            },
            actor: {
              senderThreadId: "child-1",
              urgency: "normal",
              hopCount: 1,
              rootThreadId: "root-1",
            },
          },
        }}
      />,
    );

    expect(markup).toContain("<details");
    expect(markup).not.toMatch(/<details[^>]*\sopen/);
    expect(markup).toContain("Message from");
    expect(markup).toContain("Accessibility review");
    expect(markup).toContain("Fixed two issues and verified the result.");
    expect(markup).toContain('data-chat-markdown="true"');
    expect(markup).toContain("## Result");
    expect(markup).not.toContain("whitespace-pre-wrap");
  });

  it("truncates long preview text", () => {
    const longText = "A".repeat(160);
    const markup = renderToStaticMarkup(
      <T3TeamActorTimelineRow
        message={{
          id: MessageId.make("actor-message-2"),
          role: "actor",
          text: longText,
          streaming: false,
          createdAt: "2026-07-19T12:00:00.000Z",
          updatedAt: "2026-07-19T12:00:00.000Z",
          turnId: null,
          t3teamExt: { visibleToUser: true },
        }}
      />,
    );

    expect(markup).toContain(`${"A".repeat(119)}…`);
  });
});
