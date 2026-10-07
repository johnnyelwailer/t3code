import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./t3team-explainerBaseSchemas";

/** Fields every explainer block shares. `id` is unique within its step; anchors point at it. */
export const T3TeamExplainerBlockBase = {
  id: TrimmedNonEmptyString,
  /** Wide players: `main` left, `aside` right, `full` across both. Narrow players stack. */
  layout: Schema.optionalKey(Schema.Literals(["main", "aside", "full"])),
  /** Folded under "Show more" until the reader asks for it. */
  detail: Schema.optionalKey(Schema.Boolean),
};
