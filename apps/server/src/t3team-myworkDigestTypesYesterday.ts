/**
 * The digest's "yesterday" wire types, split from `t3team-myworkDigestTypes.ts`: what the viewer
 * merged and which of their tickets moved on their last working day.
 */

import type { T3TeamDigestTicketRef } from "./t3team-myworkDigestTypes.ts";

export type T3TeamDigestYesterdayMerged = {
  /** `host:repo#number`, the digest's own PR id. */
  readonly id: string;
  readonly host: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  /** The project ticket the title names, when it names one. */
  readonly workItemKey?: string;
};

export type T3TeamDigestYesterdayMoved = {
  readonly ticketRef: T3TeamDigestTicketRef;
  /** Status before and after, when the mirror saw the move; absent for a ticket merely updated. */
  readonly from?: string;
  readonly to?: string;
  readonly at: string;
};

/** One project's slice of the viewer's last working day. */
export type T3TeamDigestYesterday = {
  /** The window, ISO instants: the found day's start up to the start of the next day. */
  readonly from: string;
  readonly until: string;
  readonly merged: ReadonlyArray<T3TeamDigestYesterdayMerged>;
  readonly moved: ReadonlyArray<T3TeamDigestYesterdayMoved>;
};
