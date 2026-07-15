import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfigMap,
} from "@t3tools/contracts";
import type { LoadedAiProviderDefinition } from "@t3work/packs";

function openCodeConfigContent(definition: LoadedAiProviderDefinition): string {
  if (definition.configuration.kind === "inline-config") {
    return definition.configuration.configContent;
  }

  const upstream = definition.configuration.provider;
  const options: Record<string, unknown> = {
    baseURL: upstream.baseURL,
    ...(definition.credentialEnv ? { apiKey: `{env:${definition.credentialEnv}}` } : {}),
  };
  const models = Object.fromEntries(
    upstream.models.map((model) => [model.id, { name: model.name }]),
  );
  return JSON.stringify({
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
