export type JiraAttachment = {
  id?: string | undefined;
  filename?: string | undefined;
  mimeType?: string | undefined;
  content?: string | undefined;
  thumbnail?: string | undefined;
  size?: number | undefined;
  author?: string | undefined;
  created?: string | undefined;
};

export type JiraCommentItem = {
  id?: string | undefined;
  author?: string | undefined;
  authorAccountId?: string | undefined;
  authorAvatarUrl?: string | undefined;
  created?: string | undefined;
  updated?: string | undefined;
  /**
   * Jira's own storage format for the comment body. Preferred for rendering: the markdown and HTML
   * projections below both lose structure that ADF carries, and only ADF round-trips an edit.
   */
  bodyAdf?: unknown;
  bodyMarkdown?: string | undefined;
  bodyHtml?: string | undefined;
  /** JSD/Jira-internal comments only visible to agents, not the reporting customer. */
  isInternal?: boolean | undefined;
};
