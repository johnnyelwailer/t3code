/**
 * Which parts of the digest carry a view-transition name. A name may exist once per page or the
 * browser skips the whole animation, so a ticket shown in several sections is named only where it
 * first appears, and a section id the plan repeats is not named at all.
 */
import { createContext, use, useMemo, type ReactNode } from "react";

import type { ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { digestViewTransitionName } from "~/t3team/t3team-digestViewTransition";

export type DigestTransitionNames = {
  readonly section: (sectionId: string) => string | undefined;
  readonly story: (sectionId: string, parentId: string) => string | undefined;
  readonly standalone: (sectionId: string) => string | undefined;
  readonly row: (sectionId: string, ticketId: string) => string | undefined;
};

const NO_NAMES: DigestTransitionNames = {
  section: () => undefined,
  story: () => undefined,
  standalone: () => undefined,
  row: () => undefined,
};

const PLACEMENT_ORDER = ["side", "main", "footer"] as const;

export function buildDigestTransitionNames(plan: ResolvedDigestPlan): DigestTransitionNames {
  const sectionCounts = new Map<string, number>();
  const rowOwners = new Map<string, string>();
  const rowCounts = new Map<string, number>();
  const ordered = PLACEMENT_ORDER.flatMap((placement) =>
    plan.sections.filter((section) => section.placement === placement),
  );
  for (const section of ordered) {
    sectionCounts.set(section.id, (sectionCounts.get(section.id) ?? 0) + 1);
    for (const item of section.items) {
      if (!rowOwners.has(item.ticketId)) rowOwners.set(item.ticketId, section.id);
      const key = `${section.id}\n${item.ticketId}`;
      rowCounts.set(key, (rowCounts.get(key) ?? 0) + 1);
    }
  }
  const unique = (sectionId: string) => sectionCounts.get(sectionId) === 1;
  return {
    section: (sectionId) =>
      unique(sectionId) ? digestViewTransitionName("section", sectionId) : undefined,
    story: (sectionId, parentId) =>
      unique(sectionId) ? digestViewTransitionName("story", `${sectionId}:${parentId}`) : undefined,
    standalone: (sectionId) =>
      unique(sectionId) ? digestViewTransitionName("standalone", sectionId) : undefined,
    row: (sectionId, ticketId) =>
      unique(sectionId) &&
      rowOwners.get(ticketId) === sectionId &&
      rowCounts.get(`${sectionId}\n${ticketId}`) === 1
        ? digestViewTransitionName("row", ticketId)
        : undefined,
  };
}

const DigestTransitionNamesContext = createContext<DigestTransitionNames>(NO_NAMES);

export function DigestTransitionNamesProvider({
  plan,
  children,
}: {
  plan: ResolvedDigestPlan;
  children: ReactNode;
}) {
  const names = useMemo(() => buildDigestTransitionNames(plan), [plan]);
  return <DigestTransitionNamesContext value={names}>{children}</DigestTransitionNamesContext>;
}

export function useDigestTransitionNames(): DigestTransitionNames {
  return use(DigestTransitionNamesContext);
}
