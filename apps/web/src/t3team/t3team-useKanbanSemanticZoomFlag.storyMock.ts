/**
 * Storybook-only stand-in for the server-advertised kanban semantic-zoom flag.
 * Stories render fixtures without a live server, so the flag is advertised
 * here; the real env-driven flag path is covered by unit tests. Wired up in
 * t3team-storybook-main.ts (alias on the exact module specifier).
 */
export function useKanbanSemanticZoomFlag(): boolean {
  return true;
}
