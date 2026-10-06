/**
 * The My Work digest's arrangement: how the digest's blocks are laid out. The heuristic default is
 * computed on the client; an agent (the `arrange-my-work` recipe) may store its own, per viewer and
 * scope, on the server. The shapes mirror the web's `DigestPlan` so the client decodes the same
 * schema the server validates against.
 *
 * Structural only. Which widget ids exist and which placements a widget allows is the bundled
 * widget list's business (`@t3tools/t3team-skill-packs`) — the server checks it on write.
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

const T3TEAM_MY_WORK_ARRANGEMENT_MAX_SECTIONS = 12;
const T3TEAM_MY_WORK_ARRANGEMENT_MAX_ITEMS = 500;

/** Where on the dashboard a section stands (the `DashboardWidgetPlacement` literals). */
export const T3TeamMyWorkDigestPlacement = Schema.Literals(["side", "main", "footer"]);
export type T3TeamMyWorkDigestPlacement = typeof T3TeamMyWorkDigestPlacement.Type;

export const T3TeamMyWorkDigestItemRef = Schema.Struct({
  ticketId: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  why: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300))),
});
export type T3TeamMyWorkDigestItemRef = typeof T3TeamMyWorkDigestItemRef.Type;

/**
 * One block. `items` sections list tickets (`items`); `reviews` sections list the pull requests in
 * `reviewIds` (the digest's `reviewRequests` ids). `widget` absent means the default for its kind.
 */
export const T3TeamMyWorkDigestSection = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(80)),
  kind: Schema.Literals(["items", "reviews"]),
  widget: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(120))),
  placement: T3TeamMyWorkDigestPlacement,
  heading: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  hint: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(400))),
  items: Schema.Array(T3TeamMyWorkDigestItemRef).check(
    Schema.isMaxLength(T3TEAM_MY_WORK_ARRANGEMENT_MAX_ITEMS),
  ),
  reviewIds: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(200))).check(
      Schema.isMaxLength(T3TEAM_MY_WORK_ARRANGEMENT_MAX_ITEMS),
    ),
  ),
});
export type T3TeamMyWorkDigestSection = typeof T3TeamMyWorkDigestSection.Type;

export const T3TeamMyWorkDigestPlan = Schema.Struct({
  producer: Schema.Literals(["heuristic", "agent"]),
  producedAt: IsoDateTime,
  sections: Schema.Array(T3TeamMyWorkDigestSection).check(
    Schema.isMaxLength(T3TEAM_MY_WORK_ARRANGEMENT_MAX_SECTIONS),
  ),
});
export type T3TeamMyWorkDigestPlan = typeof T3TeamMyWorkDigestPlan.Type;
