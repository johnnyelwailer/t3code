import { ChatGptWelcomeCoordinator } from "../settings/ChatGptWelcomeCoordinator";
import { useWorkSourceFirstRun } from "./t3team-welcomeWizardFlow";

/** The ChatGPT sharing notice, skipped when first run starts from work sources. */
export function T3TeamChatGptWelcomeCoordinator() {
  return useWorkSourceFirstRun() ? null : <ChatGptWelcomeCoordinator />;
}
