import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import type { LoadedAiProviderDefinition } from "@t3work/packs";

export type OpenCodeUpstreamProviderShape = {
  readonly id: string;
  readonly name: string;
  readonly baseURL: string;
  readonly api: "chat-completions" | "responses";
  readonly models: readonly { readonly id: string; readonly name: string }[];
};

/**
 * Builds the OpenCode `config.json` `provider` block for an upstream-provider
 * definition. Shared by the data-only pack path and the executable
 * `createOpenCodeHarness` host capability so both emit identical config.
 */
export function openCodeUpstreamConfigContent(input: {
  readonly provider: OpenCodeUpstreamProviderShape;
  readonly credentialEnv?: string | undefined;
  /**
   * Optional default model id (unqualified). When present, emits a top-level
   * OpenCode `model: "<providerId>/<modelId>"` so the harness honors the pack's
   * declared default. Omitted by the data-only path (behavior unchanged).
   */
  readonly defaultModel?: string | undefined;
}): string {
  const upstream = input.provider;
  const options: Record<string, unknown> = {
    baseURL: upstream.baseURL,
    ...(input.credentialEnv ? { apiKey: `{env:${input.credentialEnv}}` } : {}),
  };
  const models = Object.fromEntries(
    upstream.models.map((model) => [model.id, { name: model.name }]),
  );
  return JSON.stringify({
    ...(input.defaultModel ? { model: `${upstream.id}/${input.defaultModel}` } : {}),
    provider: {
      [upstream.id]: {
        npm: upstream.api === "responses" ? "@ai-sdk/openai" : "@ai-sdk/openai-compatible",
        name: upstream.name,
        options,
        models,
      },
    },
  });
}

function openCodeConfigContent(definition: LoadedAiProviderDefinition): string {
  if (definition.configuration.kind === "inline-config") {
    return definition.configuration.configContent;
  }
  return openCodeUpstreamConfigContent({
    provider: definition.configuration.provider,
    credentialEnv: definition.credentialEnv,
  });
}

/** Maps reviewed pack data onto the existing OpenCode driver; no pack code is executed. */
export function packAiProvidersToInstanceConfigMap(
  definitions: ReadonlyArray<LoadedAiProviderDefinition>,
): ProviderInstanceConfigMap {
  const entries = definitions.map((definition) => {
    const providerId =
      definition.configuration.kind === "upstream-provider"
        ? definition.configuration.provider.id
        : undefined;
    const configuredModels =
      definition.configuration.kind === "upstream-provider"
        ? definition.configuration.provider.models.map((model) => `${providerId}/${model.id}`)
        : [];
    const instanceId = ProviderInstanceId.make(definition.id);
    return [
      instanceId,
      {
        driver: ProviderDriverKind.make(definition.driver),
        displayName: definition.displayName,
        ...(definition.accent ? { accentColor: definition.accent } : {}),
        ...(definition.iconDataUrl ? { iconDataUrl: definition.iconDataUrl } : {}),
        configurationSource: "pack",
        config: {
          enabled: true,
          configContent: openCodeConfigContent(definition),
          customModels: configuredModels,
        },
      },
    ] as const;
  });
  return Object.fromEntries(entries) as ProviderInstanceConfigMap;
}
