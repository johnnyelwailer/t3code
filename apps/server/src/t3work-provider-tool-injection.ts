import { ProviderDriverKind } from "@t3tools/contracts";

interface RawToolInjectionEnvelope {
  readonly providers?: Record<string, unknown>;
}

interface RawProviderInjectionConfig {
  readonly mcpServers?: unknown;
  readonly reloadMcpConfig?: unknown;
}

export interface T3workRawToolInjectionConfig {
  readonly claudeMcpServers: ReadonlyArray<unknown>;
  readonly cursorMcpServers: ReadonlyArray<unknown>;
  readonly codexMcpServers: Readonly<Record<string, unknown>>;
  readonly openCodeMcpServers: Readonly<Record<string, unknown>>;
  readonly codexReloadMcpConfig: boolean;
}

export interface T3workProviderToolInjectionPlan {
  readonly claudeMcpServers?: ReadonlyArray<unknown>;
  readonly cursorMcpServers?: ReadonlyArray<unknown>;
  readonly codexMcpAdds: ReadonlyArray<{
    readonly name: string;
    readonly config: Record<string, unknown>;
  }>;
  readonly openCodeMcpAdds: ReadonlyArray<{
    readonly name: string;
    readonly config: Record<string, unknown>;
  }>;
  readonly codexReloadMcpConfig: boolean;
}

export const T3WORK_RAW_TOOL_INJECTION_ENV = "T3WORK_RAW_TOOL_INJECTION_JSON";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asProviderConfig(
  providers: Readonly<Record<string, unknown>>,
  provider: ProviderDriverKind,
): RawProviderInjectionConfig {
  const raw = providers[provider];
  return isRecord(raw) ? raw : {};
}

function asUnknownArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function resolveT3workRawToolInjectionConfig(
  environment?: NodeJS.ProcessEnv,
): T3workRawToolInjectionConfig | undefined {
  const raw = environment?.[T3WORK_RAW_TOOL_INJECTION_ENV]?.trim();
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;

  const envelope = parsed as RawToolInjectionEnvelope;
  const providers = isRecord(envelope.providers) ? envelope.providers : {};
  const claudeConfig = asProviderConfig(providers, ProviderDriverKind.make("claudeAgent"));
  const codexConfig = asProviderConfig(providers, ProviderDriverKind.make("codex"));
  const cursorConfig = asProviderConfig(providers, ProviderDriverKind.make("cursor"));
  const openCodeConfig = asProviderConfig(providers, ProviderDriverKind.make("opencode"));

  return {
    claudeMcpServers: asUnknownArray(claudeConfig.mcpServers),
    cursorMcpServers: asUnknownArray(cursorConfig.mcpServers),
    codexMcpServers: asRecord(codexConfig.mcpServers),
    openCodeMcpServers: asRecord(openCodeConfig.mcpServers),
    codexReloadMcpConfig: asBoolean(codexConfig.reloadMcpConfig, false),
  };
}

export function buildT3workProviderToolInjectionPlan(
  environment?: NodeJS.ProcessEnv,
): T3workProviderToolInjectionPlan {
  const resolved = resolveT3workRawToolInjectionConfig(environment);
  const claudeMcpServers = resolved?.claudeMcpServers ?? [];
  const cursorMcpServers = resolved?.cursorMcpServers ?? [];
  const codexMcpAdds = Object.entries(resolved?.codexMcpServers ?? {}).map(([name, config]) => ({
    name,
    config: isRecord(config) ? config : {},
  }));
  const openCodeMcpAdds = Object.entries(resolved?.openCodeMcpServers ?? {}).map(
    ([name, config]) => ({
      name,
      config: isRecord(config) ? config : {},
    }),
  );

  return {
    ...(claudeMcpServers.length > 0 ? { claudeMcpServers } : {}),
    ...(cursorMcpServers.length > 0 ? { cursorMcpServers } : {}),
    codexMcpAdds,
    openCodeMcpAdds,
    codexReloadMcpConfig: resolved?.codexReloadMcpConfig === true,
  };
}
