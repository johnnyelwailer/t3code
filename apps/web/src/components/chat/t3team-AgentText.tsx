/**
 * Agent-written text on compact surfaces (banners, card fields), rendered as inline Markdown
 * through the shared ChatMarkdown, so `code` and **bold** never show as raw punctuation.
 */
import type { ReactNode } from "react";
import ChatMarkdown from "~/components/ChatMarkdown";

export function T3TeamAgentText(props: {
  readonly text: string;
  readonly className?: string | undefined;
}): ReactNode {
  return (
    <ChatMarkdown
      text={props.text}
      cwd={undefined}
      inline
      lineBreaks
      isStreaming={false}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
