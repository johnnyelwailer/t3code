/**
 * Markdown rendering for the composer's pending user-input panel.
 *
 * t3team ask_user questions (and provider-native questions) may carry rich
 * markdown — context paragraphs, lists, code. The panel used to render the
 * raw text in a <p>, which is how a 1200-character question surfaced as an
 * unstyled wall of text. This renderer reuses the chat's ChatMarkdown
 * primitive so questions render the same way chat messages do.
 *
 * @module components/chat/t3team-pendingQuestionMarkdown
 */
import type { ReactNode } from "react";
import ChatMarkdown from "~/components/ChatMarkdown";
import { cn } from "~/lib/utils";

export function T3TeamPendingQuestionMarkdown(props: {
  readonly text: string;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <ChatMarkdown
      text={props.text}
      cwd={undefined}
      isStreaming={false}
      className={cn("text-foreground/85", props.className)}
    />
  );
}
