import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { buildViewWidgetSrcdoc } from "~/t3team/t3team-viewWidgetSrcdoc";

/** Facts a My Work widget section may read through `window.viewData`. */
export type DigestWidgetSnapshot = {
  readonly sectionId: string;
  readonly heading: string;
  readonly tickets: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly status: string;
  }>;
  readonly reviews: ReadonlyArray<{ readonly id: string; readonly title: string }>;
};

const SNAPSHOT_CAP = 40;

export function digestWidgetSnapshot(section: DigestSection, graph: DigestGraph): DigestWidgetSnapshot {
  const wanted = new Set(section.items.map((item) => item.ticketId));
  const ranked = [...graph.tickets].sort((left, right) => {
    const leftWanted = wanted.has(left.id) ? 0 : 1;
    const rightWanted = wanted.has(right.id) ? 0 : 1;
    return leftWanted - rightWanted;
  });
  return {
    sectionId: section.id,
    heading: section.heading,
    tickets: ranked.slice(0, SNAPSHOT_CAP).map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
    })),
    reviews: (graph.reviewRequests ?? []).slice(0, SNAPSHOT_CAP).map((review) => ({
      id: review.id,
      title: review.title,
    })),
  };
}

/** My Work's call into the surface-agnostic widget srcdoc. */
export function buildDigestWidgetSrcdoc(input: {
  readonly html: string;
  readonly snapshot: DigestWidgetSnapshot;
  readonly themeCss: string;
}): string | undefined {
  return buildViewWidgetSrcdoc({
    html: input.html,
    data: input.snapshot,
    themeCss: input.themeCss,
  });
}
