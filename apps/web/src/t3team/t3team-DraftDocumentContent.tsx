import {
  HtmlBlock,
  MarkdownBlock,
} from "~/t3team/components/ticket/t3team-ticketRichContentBlocks";
import type { T3TeamDraftRichContent } from "~/t3team/t3team-draftMutationTypes";

export function DraftDocumentContent({ content }: { content: T3TeamDraftRichContent | undefined }) {
  if (!content || content.body.trim().length === 0) {
    return <p className="text-sm text-muted-foreground">No content available.</p>;
  }

  if (content.format === "html") {
    return (
      <HtmlBlock
        content={content.body}
        {...(content.baseUrl ? { baseUrl: content.baseUrl } : {})}
      />
    );
  }

  if (content.format === "markdown") {
    return <MarkdownBlock content={content.body} />;
  }

  return <p className="whitespace-pre-wrap text-sm leading-6">{content.body}</p>;
}
