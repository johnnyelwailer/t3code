import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/));
const DataUrl = Schema.String.check(Schema.isPattern(/^data:image\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]+$/i));

export const SetupProfileCommunicationStyle = Schema.Struct({
  technicalDepth: Schema.Literals(["low", "medium", "high"]),
  brevity: Schema.Literals(["short", "balanced", "detailed"]),
  guidanceStyle: Schema.Literals(["guided", "balanced", "expert"]),
  defaultLanguage: Schema.optionalKey(Schema.String),
});

/**
 * Runtime schema for a pack-contributed project-setup profile. Icons arrive as
 * data URLs (the pack resolves pack-relative paths via `resolveAssetDataUrl`
 * during activation), so no filesystem access happens here.
 */
export const SetupProfileDefinition = Schema.Struct({
  id: Identifier,
  title: Schema.String.check(Schema.isMinLength(1)),
  description: Schema.String.check(Schema.isMinLength(1)),
  badge: Schema.String.check(Schema.isMinLength(1)),
  bullets: Schema.Array(Schema.String.check(Schema.isMinLength(1))).check(Schema.isMinLength(1)),
  category: Schema.Literals(["product", "delivery", "engineering", "operations", "security"]),
  iconDataUrl: Schema.optionalKey(DataUrl),
  audience: Schema.Literals(["mixed", "qa", "product", "support", "delivery", "engineering"]),
  communicationStyle: SetupProfileCommunicationStyle,
  preferredArtifactKinds: Schema.Array(Schema.String),
  recipeWeights: Schema.Record(Schema.String, Schema.Number),
  recommendedSkillPackIds: Schema.Array(Schema.String),
  hideImplementationComplexity: Schema.Boolean,
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  defaultActionFamilies: Schema.optionalKey(Schema.Array(Schema.String)),
  default: Schema.optionalKey(Schema.Boolean),
});
export type SetupProfileDefinition = typeof SetupProfileDefinition.Type;

export const decodeSetupProfileDefinition = Schema.decodeUnknownSync(SetupProfileDefinition);
export const defineSetupProfile = <const T extends SetupProfileDefinition>(definition: T): T =>
  definition;
