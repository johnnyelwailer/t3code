/** `pack-ui` `Markdown`: the chat markdown renderer, with raw HTML off and the pack URL policy. */
import type { PackMarkdownProps, PackRemarkPlugin } from "@t3team/pack-ui/contract";
import { useMemo, type ComponentProps } from "react";

import ChatMarkdown from "~/components/ChatMarkdown";

import { remarkPackSafeUrls } from "./t3team-packMarkdownSafety";

type RemarkPlugins = NonNullable<ComponentProps<typeof ChatMarkdown>["extraRemarkPlugins"]>;

const NO_PLUGINS: ReadonlyArray<PackRemarkPlugin> = [];

export function PackMarkdown({
  text,
  size = "default",
  remarkPlugins = NO_PLUGINS,
}: PackMarkdownProps) {
  // The URL policy runs last, so a pack plugin cannot add a link or image it would refuse.
  const plugins = useMemo(
    (): RemarkPlugins => [...remarkPlugins, remarkPackSafeUrls],
    [remarkPlugins],
  );
  // ChatMarkdown parses sanitized raw HTML by default; pack text is untrusted data, so never.
  return (
    <ChatMarkdown
      text={text}
      cwd={undefined}
      parseRawHtml={false}
      extraRemarkPlugins={plugins}
      {...(size === "compact" ? { className: "text-xs" } : {})}
    />
  );
}
