import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/));
const ModelIdentifier = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/));
const EnvironmentName = Schema.String.check(Schema.isPattern(/^[A-Z][A-Z0-9_]*$/));
const HttpUrl = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { expected: "an absolute HTTP(S) URL" },
  ),
);

export const OpenCodeModelDefinition = Schema.Struct({
  id: ModelIdentifier,
  name: Schema.String,
});

export const OpenCodeUpstreamProvider = Schema.Struct({
  id: Identifier,
  name: Schema.String,
  baseURL: HttpUrl,
  api: Schema.Literals(["chat-completions", "responses"]),
  models: Schema.Array(OpenCodeModelDefinition),
});

export const OpenCodeProviderConfiguration = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("inline-config"),
    configContent: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("upstream-provider"),
    provider: OpenCodeUpstreamProvider,
  }),
]);

// This file is configuration for the built-in OpenCode harness, never executable pack code.
export const AiProviderDefinition = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  id: Identifier,
  driver: Schema.Literal("opencode"),
  displayName: Schema.String,
  accent: Schema.optional(Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/))),
  icon: Schema.optional(Schema.String),
  configuration: OpenCodeProviderConfiguration,
  credentialEnv: Schema.optional(EnvironmentName),
  modelDiscovery: Schema.optional(Schema.Literals(["configured", "dynamic"])),
  modelSelection: Schema.optional(Schema.Literals(["user", "fixed"])),
  defaultModel: Schema.optional(ModelIdentifier),
});
export type AiProviderDefinition = typeof AiProviderDefinition.Type;

export type LoadedAiProviderDefinition = AiProviderDefinition & {
  readonly iconDataUrl?: string;
};

export const decodeAiProviderDefinition = Schema.decodeUnknownSync(AiProviderDefinition);

export const defineAiProvider = <const T extends AiProviderDefinition>(definition: T): T =>
  definition;
