import type { ResourcePage } from "@t3tools/project-context";

/**
 * My Work page. `viewerAccountId` is the Jira *user* the server scoped the page
 * to (NOT the Jira site id in `project.source.accountId`); rows whose
 * `assigneeAccountId` equals it are "assigned to me", the rest are parent context.
 */
export type T3TeamMyWorkPage = ResourcePage & { readonly viewerAccountId?: string };
