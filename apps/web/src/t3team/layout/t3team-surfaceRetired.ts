/**
 * The fork's retired right-panel surface kinds: persisted entries are dropped by the
 * store's storage migration. A re-landed kind gets a live registry entry instead.
 */

/** The `t3team`-namespace kind the fork's peer-thread surface had when it was retired. */
export const T3_TEAM_THREAD_SURFACE_KIND = "t3team.thread" as const;

/**
 * The right-panel-store kinds the fork retired. The peer-thread surface (retired with the
 * move to upstream's side chat) rendered as kind `thread`; its persisted entries are
 * dropped at storage v15.
 */
export const T3_TEAM_RETiredRightPanelKinds: readonly string[] = ["thread"];

/** Whether a persisted right-panel kind was retired by the fork. */
export function t3TeamIsRetiredRightPanelKind(kind: string | undefined): boolean {
  return kind !== undefined && T3_TEAM_RETiredRightPanelKinds.includes(kind);
}
