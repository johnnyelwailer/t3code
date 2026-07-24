import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sanitizeJiraHtml } from "./t3team-ticketRichContentUtils";

export function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="chat-markdown text-sm leading-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export function HtmlBlock({
  content,
  baseUrl,
  resolveAssetUrl,
}: {
  content: string;
  baseUrl?: string;
  resolveAssetUrl?: (url: string) => string;
}) {
  const sanitized = useMemo(
    () => sanitizeJiraHtml(content, baseUrl, resolveAssetUrl),
    [baseUrl, content, resolveAssetUrl],
  );
  return (
    <div
      className="chat-markdown text-sm leading-6"
      // Jira rendered HTML is sanitized before rendering.
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
