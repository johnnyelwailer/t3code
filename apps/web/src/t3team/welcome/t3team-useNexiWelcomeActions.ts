import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import type { FeatureFlagKey } from "@t3tools/project-context/t3teamFeatureFlags";

import { useAccount } from "~/account/t3team-useAccounts";
import { useCloudBrokerStatus } from "~/cloud/t3team-useCloudBrokerStatus";
import { useCloudSessionController } from "~/cloud/t3team-useCloudSessionController";
import { useJiraAccountStatuses } from "~/components/settings/t3team-useJiraAccountStatuses";
import { toolAuthMetaForTool } from "~/components/settings/t3team-toolAuthTools";
import { readLocalApi } from "~/localApi";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerConfigAtom, serverEnvironment } from "~/state/server";
import { useToolAuthActions, useToolAuthStates } from "~/state/t3team-toolauth";
import { useAtomCommand } from "~/state/use-atom-command";
import { useBackend } from "~/t3team/backend/t3team-index";
import { useAtlassianOAuth } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import { useGitHubSignIn, useGitHubSignInHosts } from "~/t3team/hooks/t3team-useGitHubSignIn";
import {
  JIRA_CONNECTIONS_OFF_TEXT,
  useJiraConnectionsEnabled,
} from "~/t3team/t3team-jiraConnectionsFlag";
import { useT3TeamPackSetupProfiles } from "~/t3team/t3team-packSetupProfiles";
import { writeT3TeamProjectSetupProfile } from "~/t3team/t3team-projectSetupProfile";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { useT3TeamWorkProfileChooserEnabled } from "~/t3team/t3team-workProfileChooser";

import { buildWelcomeAgentRows, isWelcomeAgentReady } from "./t3team-welcomeAgents.logic";
import { useWelcomeChosenRole } from "./t3team-useWelcomeChosenRole";
import { useWelcomeAccountCheck, useWelcomeJiraCheck } from "./t3team-useWelcomeChecks";
import { completeWelcomeSetup } from "./t3team-welcomeSeen";
import { useWelcomeSkips } from "./t3team-useWelcomeSkips";

function openExternal(url: string) {
  const api = readLocalApi();
  if (api) void api.shell.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function copyOpen(code?: string, url?: string) {
  if (code) void navigator.clipboard?.writeText(code).catch(() => {});
  if (url) openExternal(url);
}

export function useNexiWelcomeActions(
  onDone: (projectRef?: ScopedProjectRef) => void | Promise<void>,
) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const serverConfig = useAtomValue(primaryServerConfigAtom);
  const environmentId = primaryEnvironmentId ?? serverConfig?.environment.environmentId ?? null;
  const broker = useCloudBrokerStatus();
  const accountId = broker?.enabled ? broker.accountId : "nexplore";
  const account = useAccount(accountId);
  const { skipped, skip } = useWelcomeSkips();
  const { accountCheck, retryAccount } = useWelcomeAccountCheck(account);

  const providersLive = useProvidersForWelcome(environmentId);
  const agentRows = buildWelcomeAgentRows(providersLive);
  const toolStates = useToolAuthStates(environmentId);
  const claude = useToolAuthActions(toolAuthMetaForTool("claude"), environmentId);
  const codex = useToolAuthActions(toolAuthMetaForTool("codex"), environmentId);

  const jiraEnabled = useJiraConnectionsEnabled();
  const jiraStatuses = useJiraAccountStatuses();
  const { jiraCheck, retryJira } = useWelcomeJiraCheck(jiraStatuses);
  const oauth = useAtlassianOAuth();
  const backend = useBackend();
  const jiraReported = useRef(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists Atlassian OAuth completion into the account list the same way JiraSignInPanel does
  useEffect(() => {
    if (jiraReported.current) return;
    if (oauth.state.kind === "connected") {
      jiraReported.current = true;
      jiraStatuses.reload();
    } else if (oauth.state.kind === "done" && backend) {
      jiraReported.current = true;
      void backend.atlassian
        .connectOAuth({ sites: oauth.state.sites, token: oauth.state.token })
        .then(() => jiraStatuses.reload())
        .catch(() => jiraStatuses.reload());
    }
  }, [oauth.state, backend, jiraStatuses]);

  const hosts = useGitHubSignInHosts([]);
  const primaryHost = hosts[0] ?? "nexplore.ghe.com";
  const secondaryHost = hosts.find((host) => host !== primaryHost) ?? "github.com";
  const ghPrimary = useGitHubSignIn(primaryHost);
  const ghSecondary = useGitHubSignIn(secondaryHost);

  const cloud = useCloudSessionController({ scopeKey: "nexi-welcome" });
  const { onPanelVisibilityChange } = cloud;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cloud session list polls only while a surface is visible; register this page for its lifetime
  useEffect(() => {
    onPanelVisibilityChange(true);
    return () => onPanelVisibilityChange(false);
  }, [onPanelVisibilityChange]);

  const cloudFlag = useFeatureFlag("CLOUD_SESSIONS");
  const phoneFlag = useFeatureFlag("NEXI_MOBILE_BROKER");
  const setFeatureFlag = useAtomCommand(serverEnvironment.setFeatureFlag);
  const turnOnFlag = async (key: FeatureFlagKey, on: boolean) => {
    if (on) return true;
    if (environmentId === null) return false;
    const result = await setFeatureFlag({ environmentId, input: { key, enabled: true } });
    return result._tag === "Success";
  };
  const roleEnabled = useT3TeamWorkProfileChooserEnabled();
  const packProfiles = useT3TeamPackSetupProfiles() ?? [];
  const storedRole = useWelcomeChosenRole();
  const chosenRole = packProfiles.some((profile) => profile.id === storedRole) ? storedRole : null;

  return {
    account,
    skipped,
    skip,
    agentRows,
    agentReady: isWelcomeAgentReady(agentRows),
    toolStates,
    onInstallTool: (tool: "claude" | "codex") =>
      tool === "claude" ? claude.onInstall() : codex.onInstall(),
    onSignInTool: (tool: "claude" | "codex") =>
      tool === "claude" ? claude.onConnect() : codex.onConnect(),
    onCopyAndOpenTool: (tool: "claude" | "codex") => {
      const state = toolStates.get(tool);
      copyOpen(state?.displayCode, state?.url);
    },
    jiraEnabled,
    jiraDisabledReason: JIRA_CONNECTIONS_OFF_TEXT,
    jiraAccounts: jiraStatuses.state.kind === "ready" ? jiraStatuses.state.accounts : null,
    jiraCheck,
    onRetryJira: retryJira,
    jiraConnecting:
      oauth.state.kind === "opening" ||
      oauth.state.kind === "waiting" ||
      oauth.state.kind === "exchanging",
    onConnectJira: () => {
      jiraReported.current = false;
      void oauth.startOAuth();
    },
    githubHosts: [primaryHost, secondaryHost] as const,
    githubPrimary: ghPrimary,
    githubSecondary: ghSecondary,
    onCopyAndOpenGitHubPrimary: () => copyOpen(ghPrimary.state?.displayCode, ghPrimary.state?.url),
    onCopyAndOpenGitHubSecondary: () =>
      copyOpen(ghSecondary.state?.displayCode, ghSecondary.state?.url),
    cloud,
    onTurnOnCloud: async () => {
      if (await turnOnFlag("CLOUD_SESSIONS", cloudFlag)) cloud.onCreate();
    },
    roleEnabled,
    packProfiles,
    chosenRole,
    onChooseRole: writeT3TeamProjectSetupProfile,
    onSetupPhone: () => void turnOnFlag("NEXI_MOBILE_BROKER", phoneFlag),
    onStart: async () => {
      await completeWelcomeSetup();
      await onDone(undefined);
    },
    accountCheck,
    onRetryAccount: retryAccount,
  };
}

function useProvidersForWelcome(environmentId: EnvironmentId | null) {
  const id = environmentId ?? ("__nexi-welcome-pending__" as EnvironmentId);
  const providers = useAtomValue(serverEnvironment.providersValueAtom(id));
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the environment to refresh its provider list when the welcome page mounts or the primary environment changes
  useEffect(() => {
    if (!environmentId) return;
    void refreshProviders({ environmentId, input: {} });
  }, [environmentId, refreshProviders]);
  return environmentId ? (providers ?? []) : [];
}
