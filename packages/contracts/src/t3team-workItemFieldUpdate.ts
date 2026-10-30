import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

const AddRemove = Schema.Struct({
  add: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  remove: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});

/** Body of the labels / priority / fix-version write; the only fields it can ever touch. */
export const WorkItemFieldUpdateInput = Schema.Struct({
  accountId: TrimmedNonEmptyString,
  issueIdOrKey: TrimmedNonEmptyString,
  labels: Schema.optional(AddRemove),
  priority: Schema.optional(TrimmedNonEmptyString),
  fixVersions: Schema.optional(AddRemove),
});
export type WorkItemFieldUpdateInput = typeof WorkItemFieldUpdateInput.Type;
