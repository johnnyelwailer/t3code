import type {
  DigestGraph,
  DigestPlacement,
  DigestSection,
  DigestYesterday,
} from "./t3team-projectMyWorkDigestTypes";
import { isDigestMorning } from "./t3team-projectMyWorkDigestYesterdayRecap";

/** The `graph` widget that lists what the viewer merged and moved in the previous working day. */
export const DIGEST_YESTERDAY_WIDGET_ID = "my-work.yesterday";

export function hasDigestYesterday(
  yesterday: DigestYesterday | undefined,
): yesterday is DigestYesterday {
  // A move without a target status is a bare update: it says nothing, so it alone is no recap.
  return (
    yesterday !== undefined &&
    (yesterday.merged.length > 0 || yesterday.moved.some((move) => move.to !== undefined))
  );
}

/**
 * Where the default plan puts Yesterday. Before noon it leads the digest — the first section of the
 * side lane, above "To review" (and at the very top once the lanes stack in a narrow column): what
 * got finished is what the viewer looks for first thing. Later in the day it is history, not an
 * ask, and sits in the footer. Leading reuses the side lane instead of adding a placement, so an
 * agent arrangement can already express it and the placement contract stays as it is.
 */
export function digestYesterdayPlacement(nowMs: number): DigestPlacement {
  return isDigestMorning(nowMs) ? "side" : "footer";
}

/** The Yesterday block, if there is anything to recap. */
export function digestYesterdaySection(
  graph: DigestGraph,
  placement: DigestPlacement,
): DigestSection[] {
  if (!hasDigestYesterday(graph.yesterday)) return [];
  return [
    {
      id: "yesterday",
      kind: "graph",
      widget: DIGEST_YESTERDAY_WIDGET_ID,
      placement,
      heading: "Yesterday",
      hint: "what you finished on your last working day",
      items: [],
    },
  ];
}

/**
 * Whether a `graph` section has anything to show. A widget this does not know shows nothing, so
 * the plan drops the section instead of leaving an empty frame.
 */
export function isDigestGraphSectionLive(section: DigestSection, graph: DigestGraph): boolean {
  return section.widget === DIGEST_YESTERDAY_WIDGET_ID && hasDigestYesterday(graph.yesterday);
}
