import type {
  DigestGraph,
  DigestSection,
  DigestYesterday,
} from "./t3team-projectMyWorkDigestTypes";

/** The `graph` widget that lists what the viewer merged and moved in the previous working day. */
export const DIGEST_YESTERDAY_WIDGET_ID = "my-work.yesterday";

export function hasDigestYesterday(
  yesterday: DigestYesterday | undefined,
): yesterday is DigestYesterday {
  return yesterday !== undefined && yesterday.merged.length + yesterday.moved.length > 0;
}

/**
 * The default Yesterday block: the footer, because it is history, not an ask. The side lane is for
 * what needs the viewer, the main lane for their work; the footer is where "nothing needed from
 * you" context sits, and spans the row, so the two short lists read side by side.
 */
export function digestYesterdaySection(graph: DigestGraph): DigestSection[] {
  if (!hasDigestYesterday(graph.yesterday)) return [];
  return [
    {
      id: "yesterday",
      kind: "graph",
      widget: DIGEST_YESTERDAY_WIDGET_ID,
      placement: "footer",
      heading: "Yesterday",
      hint: "what you merged and moved on your last working day",
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
