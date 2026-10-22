/**
 * Digest, list, board, and backlog share this column inside one scope — a single
 * project, or all projects — and every loading state of it, so nothing reflows on hand-off.
 * 120rem (1920px) fills a 2560px widescreen next to the sidebar without stretching rows into
 * unreadable lines; anything narrower than that is simply full width.
 */
export const t3teamScopeContentWidthClass = "max-w-[120rem]";
