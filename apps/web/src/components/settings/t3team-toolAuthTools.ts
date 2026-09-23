import { ProviderDriverKind, type ToolAuthToolId } from "@t3tools/contracts";

import { ClaudeAI, GitHubIcon, OpenAI, type Icon } from "../Icons";

/**
 * Static per-tool metadata for the "Connected tools" card list. Mirrors the
 * server-side adapter table's `label`/`description`
 * (`apps/server/src/toolauth/adapters.ts`) — kept as a small, separate
 * definition here since the server adapters carry process/regex internals
 * that have no business on the client.
 *
 * `icon` follows the same tool→brand-mark pairing `PROVIDER_ICON_BY_PROVIDER`
 * (`../chat/providerIconUtils.ts`) already establishes for the provider
 * picker: `codex → OpenAI`, `claude(Agent) → ClaudeAI`.
 */
export interface ToolAuthToolMeta {
  readonly tool: ToolAuthToolId;
  readonly label: string;
  readonly description: string;
  readonly icon: Icon;
}

export const TOOL_AUTH_TOOLS: ReadonlyArray<ToolAuthToolMeta> = [
  {
    tool: "claude",
    label: "Claude Code",
    description: "Sign in with your Claude account to use Claude Code in this sandbox.",
    icon: ClaudeAI,
  },
  {
    tool: "codex",
    label: "Codex",
    description: "Sign in with your ChatGPT account to use Codex in this sandbox.",
    icon: OpenAI,
  },
  {
    tool: "gh",
    label: "GitHub",
    description:
      "Log in to your GHE account (nexplore.ghe.com) so git work in this sandbox uses your own identity.",
    icon: GitHubIcon,
  },
];

/**
 * `ProviderDriverKind` is an open slug (custom forks can register new
 * kinds); `ToolAuthToolId` is the closed `"claude" | "codex" | "gh"` union —
 * only claude and codex are provider drivers with a sign-in flow; `gh` signs
 * in the GHE CLI but is not a provider, so no driver kind maps to it. Drivers
 * with no entry here (cursor, grok, opencode, ...) must not render a connect
 * card anywhere.
 */
const TOOL_AUTH_TOOL_BY_DRIVER_KIND: ReadonlyMap<ProviderDriverKind, ToolAuthToolId> = new Map([
  [ProviderDriverKind.make("claudeAgent"), "claude"],
  [ProviderDriverKind.make("codex"), "codex"],
]);

export function toolAuthToolForDriverKind(
  driverKind: ProviderDriverKind,
): ToolAuthToolId | undefined {
  return TOOL_AUTH_TOOL_BY_DRIVER_KIND.get(driverKind);
}

export function toolAuthMetaForTool(tool: ToolAuthToolId): ToolAuthToolMeta {
  // Non-null: TOOL_AUTH_TOOLS always has exactly one entry per ToolAuthToolId.
  return TOOL_AUTH_TOOLS.find((meta) => meta.tool === tool)!;
}
