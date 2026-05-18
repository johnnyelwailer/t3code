import type { ServerProvider } from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import type { BackendState } from "./t3work-types";

const MOCK_PROVIDERS: ServerProvider[] = [
  {
    instanceId: "codex" as any,
    driver: "codex" as any,
    displayName: "Codex",
    enabled: true,
    installed: true,
    version: "latest",
    status: "ready" as any,
    auth: {
      status: "authenticated" as any,
      type: "openai",
      label: "OpenAI",
      email: "dev@example.com",
    },
    checkedAt: new Date().toISOString(),
    models: [
      { slug: "gpt-4o", name: "GPT-4o", isCustom: false, capabilities: null },
      { slug: "o3-mini", name: "o3-mini", isCustom: false, capabilities: null },
    ],
    slashCommands: [],
    skills: [],
  },
  {
    instanceId: "opencode" as any,
    driver: "opencode" as any,
    displayName: "OpenCode",
    enabled: true,
    installed: true,
    version: "1.3.15",
    status: "ready" as any,
    auth: {
      status: "authenticated" as any,
      type: "api_key",
      label: "OpenCode",
      email: "dev@example.com",
    },
    checkedAt: new Date().toISOString(),
    models: [
      {
        slug: "opencode-default",
        name: "OpenCode Default",
        isCustom: false,
        capabilities: null,
      },
    ],
    slashCommands: [],
    skills: [],
  },
  {
    instanceId: "claude-code" as any,
    driver: "claude-code" as any,
    displayName: "Claude Code",
    enabled: false,
    installed: true,
    version: "0.2.111",
    status: "disabled" as any,
    auth: { status: "unauthenticated" as any },
    checkedAt: new Date().toISOString(),
    models: [],
    slashCommands: [],
    skills: [],
  },
];

export const INITIAL_MOCK_BACKEND_STATE: BackendState = {
  connectionStatus: "connected",
  serverConfig: {
    settings: DEFAULT_SERVER_SETTINGS,
    providers: MOCK_PROVIDERS,
    keybindings: [],
    keybindingsConfigPath: null,
    issues: [],
    availableEditors: ["vscode" as any, "cursor" as any, "zed" as any],
    observability: {
      logsDirectoryPath: "/tmp/t3/logs",
      localTracingEnabled: true,
      otlpTracesEnabled: false,
      otlpMetricsEnabled: false,
    },
  } as any,
  providers: MOCK_PROVIDERS,
  error: null,
};
