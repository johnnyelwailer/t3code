import { Loader2 } from "lucide-react";
import type { ResourceSnapshot } from "@t3tools/project-context";
import { T3SurfaceCard, T3SurfaceCardContent } from "~/t3work/components/ui/t3work-surface";
import { TicketMetadata } from "~/t3work/components/ticket/t3work-TicketMetadata";
import { TicketRichContent } from "~/t3work/components/ticket/t3work-TicketRichContent";
import { GitHubActivitySection } from "~/t3work/t3work-GitHubActivitySection";
import { buildTicketRelationships } from "~/t3work/t3work-ticketRelationships-helpers";
import { TicketParentSummary, TicketRelatedLinks } from "~/t3work/t3work-TicketRelationships";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

export function TicketDetailMainColumn({
  snapshot,
  displayId,
  title,
  status,
  priority,
  assignee,
  projectId,
  projectTickets,
  ticketId,
  ticketParentId,
  snapshotParentId,
  snapshotRaw,
  onOpenTicket,
  loading,
  error,
  descriptionMarkdown,
  descriptionHtml,
  htmlBaseUrl,
  attachments,
  sortedComments,
  githubActivityItems,
  githubActivityLoading,
  githubActivityWarning,
  githubHost,
  githubAccount,
}: {
  snapshot: ResourceSnapshot | null;
  displayId: string;
  title: string;
  status: string;
  priority: string | undefined;
  assignee: string | undefined;
  projectId: string;
  projectTickets: ProjectTicket[];
  ticketId: string;
  ticketParentId: string | undefined;
  snapshotParentId: string | undefined;
  snapshotRaw: unknown;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  loading: boolean;
  error: string | null;
  descriptionMarkdown: string | undefined;
  descriptionHtml: string | undefined;
  htmlBaseUrl: string | undefined;
  attachments: Array<Record<string, unknown>>;
  sortedComments: Array<Record<string, unknown>>;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  githubActivityLoading?: boolean;
  githubActivityWarning?: string;
  githubHost?: string;
  githubAccount?: string;
}) {
  const relationshipData = buildTicketRelationships({
    projectTickets,
    ticketId,
    displayId,
    ticketParentId,
    snapshotParentId,
    snapshotRaw,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 px-3 py-4 sm:px-5">
      <TicketMetadata snapshot={snapshot} priority={priority} assignee={assignee} />

      <TicketParentSummary
        projectId={projectId}
        onOpenTicket={onOpenTicket}
        parentEntry={relationshipData.parentEntry}
      />

      <GitHubActivitySection
        title="Related GitHub activity"
        items={githubActivityItems}
        {...(githubActivityLoading ? { loading: githubActivityLoading } : {})}
        {...(githubActivityWarning ? { warning: githubActivityWarning } : {})}
        {...(githubHost ? { host: githubHost } : {})}
        {...(githubAccount ? { account: githubAccount } : {})}
      />

      {loading ? (
        <T3SurfaceCard>
          <T3SurfaceCardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading ticket details...
          </T3SurfaceCardContent>
        </T3SurfaceCard>
      ) : null}

      {error ? (
        <T3SurfaceCard tone="danger">
          <T3SurfaceCardContent className="text-sm text-destructive">{error}</T3SurfaceCardContent>
        </T3SurfaceCard>
      ) : null}

      <TicketRichContent
        {...(descriptionMarkdown ? { descriptionMarkdown } : {})}
        {...(descriptionHtml ? { descriptionHtml } : {})}
        {...(htmlBaseUrl ? { htmlBaseUrl } : {})}
        afterDescription={
          <TicketRelatedLinks
            projectId={projectId}
            onOpenTicket={onOpenTicket}
            childEntries={relationshipData.childEntries}
            referencedEntries={relationshipData.referencedEntries}
          />
        }
        attachments={attachments.map((attachment) => ({
          id: typeof attachment.id === "string" ? attachment.id : undefined,
          filename: typeof attachment.filename === "string" ? attachment.filename : undefined,
          mimeType: typeof attachment.mimeType === "string" ? attachment.mimeType : undefined,
          content: typeof attachment.content === "string" ? attachment.content : undefined,
          thumbnail: typeof attachment.thumbnail === "string" ? attachment.thumbnail : undefined,
          size: typeof attachment.size === "number" ? attachment.size : undefined,
        }))}
        comments={sortedComments.map((comment) => ({
          id: typeof comment.id === "string" ? comment.id : undefined,
          author: typeof comment.author === "string" ? comment.author : undefined,
          created: typeof comment.created === "string" ? comment.created : undefined,
          updated: typeof comment.updated === "string" ? comment.updated : undefined,
          bodyMarkdown: typeof comment.bodyMarkdown === "string" ? comment.bodyMarkdown : undefined,
          bodyHtml: typeof comment.bodyHtml === "string" ? comment.bodyHtml : undefined,
        }))}
      />
    </div>
  );
}
