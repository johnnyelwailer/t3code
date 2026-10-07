/** `pack-ui` `Markdown`: the chat markdown renderer with raw HTML shown as text, never parsed. */
import type { PackMarkdownProps } from "@t3team/pack-ui/contract";

import ChatMarkdown from "~/components/ChatMarkdown";

export function PackMarkdown({ text }: PackMarkdownProps) {
  // ChatMarkdown parses sanitized raw HTML by default; pack text is untrusted data, so never.
  return <ChatMarkdown text={text} cwd={undefined} parseRawHtml={false} />;
}
