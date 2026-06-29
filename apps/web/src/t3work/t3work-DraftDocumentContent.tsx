import {
  HtmlBlock,
  MarkdownBlock,
} from "~/t3work/components/ticket/t3work-ticketRichContentBlocks";
import type { T3WorkDraftRichContent } from "~/t3work/t3work-draftMutationTypes";

export function DraftDocumentContent({ content }: { content: T3WorkDraftRichContent | undefined }) {
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
