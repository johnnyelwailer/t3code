/** Client gate for the context chat tab: `CONTEXT_CHAT_TAB`, default off, read from the live server config. */
import type { ServerConfig } from "@t3tools/contracts";

import { readPrimaryServerConfig, useServerConfig } from "~/t3team/t3team-serverState";
import { readServerFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export function isT3TeamContextChatTabEnabled(config: ServerConfig | null): boolean {
  return readServerFeatureFlag(config, "CONTEXT_CHAT_TAB");
}

export function useT3TeamContextChatTabEnabled(): boolean {
  return isT3TeamContextChatTabEnabled(useServerConfig());
}

export function readT3TeamContextChatTabEnabled(): boolean {
  return isT3TeamContextChatTabEnabled(readPrimaryServerConfig());
}
