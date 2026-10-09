import { useState, type ReactNode } from "react";

import type { CatalogRow } from "~/t3team/hooks/t3team-createProjectCatalogRows";
import type { CreateProjectConnect } from "~/t3team/hooks/t3team-useCreateProjectConnect";
import {
  jiraCatalogEntryKey,
  type JiraCatalogProject,
} from "~/t3team/hooks/t3team-jiraProjectCatalog.logic";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";
import type { OAuthState } from "~/t3team/hooks/t3team-useAtlassianOAuth";
import { CreateProjectConnectView } from "~/t3team/t3team-CreateProjectConnectPanel";
import { CreateProjectPage } from "~/t3team/t3team-CreateProjectPage";
import type { CreateProjectPageHeaderEntry } from "~/t3team/t3team-CreateProjectPageHeader";
import type { CreateProjectChooseStepProps } from "~/t3team/t3team-CreateProjectChooseStep";
import type { CreateProjectSetupStepProps } from "~/t3team/t3team-CreateProjectSetupStep";

const NEXPLORE = "nexplore.atlassian.net";
const ACME = "acme.atlassian.net";

const entry = (
  accountId: string,
  siteHost: string,
  externalProjectId: string,
  key: string,
  title: string,
): JiraCatalogProject => ({
  entryKey: jiraCatalogEntryKey(accountId, externalProjectId),
  accountId,
  provider: "atlassian",
  externalProjectId,
  key,
  title,
  iconUrl: undefined,
  siteHost,
});

export const nexploreProjects: ReadonlyArray<JiraCatalogProject> = [
  entry("site-nx", NEXPLORE, "10001", "IES", "IES NG"),
  entry("site-nx", NEXPLORE, "10002", "IESS", "IES Sandbox (Scrum)"),
  entry("site-nx", NEXPLORE, "10003", "HIVE", "Hive Platform"),
  entry("site-nx", NEXPLORE, "10004", "NEXI", "Nexi Distribution"),
  entry("site-nx", NEXPLORE, "10005", "STAM", "Stammdaten"),
  entry("site-nx", NEXPLORE, "10006", "ALRM", "Alarm Service"),
];

export const acmeProjects: ReadonlyArray<JiraCatalogProject> = [
  entry("site-acme", ACME, "20001", "MOB", "Mobile Checkout"),
  entry("site-acme", ACME, "20002", "OPS", "Ops Board"),
  entry("site-acme", ACME, "20003", "WRK", "Workspace Rollout"),
  entry("site-acme", ACME, "20004", "SUP", "Customer Support"),
];

export const manySitesCatalog = [...nexploreProjects, ...acmeProjects];

/** IES NG and Mobile Checkout already exist in the app. */
export const boundProjectIds: ReadonlyMap<string, string> = new Map([
  ["site-nx::10001", "app-project-ies"],
  ["site-acme::20001", "app-project-mob"],
]);

export const catalogState = (
  over: Partial<CreateProjectChooseStepProps["catalogState"]> = {},
): CreateProjectChooseStepProps["catalogState"] => ({
  catalog: manySitesCatalog,
  loading: false,
  connected: true,
  error: null,
  siteFailures: [],
  refresh: async () => {},
  ...over,
});

export const chooseProps = (
  over: Partial<CreateProjectChooseStepProps> = {},
): CreateProjectChooseStepProps => ({
  catalogState: catalogState(),
  boundProjectIds,
  connectPanel: null,
  onChoose: (_row: CatalogRow) => {},
  ...over,
});

const repo = (host: string, name: string, description: string, isPrivate = true, day = 1) => ({
  id: `${host}/${name}`,
  nameWithOwner: name,
  url: `https://${host}/${name}`,
  host,
  description,
  isPrivate,
  updatedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
});

export const repositoryCatalog = [
  ...["alarm", "base-libs", "base-config", "base-notifications", "stammdaten"].map((n, i) =>
    repo("nexplore.ghe.com", `hive/ies-${n}`, `IES ${n} module`, true, 5 - i),
  ),
  repo("nexplore.ghe.com", "pj/nexi-distribution", "Nexi desktop distribution", true, 6),
  repo("github.com", "djangal/songflow", "Music practice app", false, 4),
  repo("github.com", "johnnyelwailer/t3code", "Fork of t3code", false, 6),
];

export const discovery = (over: Partial<GitHubDiscoveryState> = {}): GitHubDiscoveryState => {
  const suggested = repositoryCatalog.slice(0, 5).map((r) => r.url);
  return {
    backendAvailable: true,
    githubHost: "github.com",
    authStatus: "authenticated",
    loadingAuth: false,
    loadingDiscovery: false,
    suggestedUrls: suggested,
    visibleSuggestedUrls: suggested,
    catalog: repositoryCatalog,
    authenticatedHosts: [
      { host: "github.com", account: "djangal", active: true },
      { host: "nexplore.ghe.com", account: "pj", active: false },
    ],
    refresh: () => {},
    ...over,
  } as GitHubDiscoveryState;
};

export const setupEntry: CreateProjectPageHeaderEntry = {
  ...nexploreProjects[0]!,
  siteHost: null,
};

export const setupProps = (
  over: Partial<CreateProjectSetupStepProps> = {},
): CreateProjectSetupStepProps => ({
  discovery: discovery(),
  linkedRepositoryUrls: [],
  onToggleRepository: () => {},
  onLinkRepositories: () => {},
  ...over,
});

/**
 * The real full-page frame, so the backdrop art and header read as they do in the app (in either
 * theme) rather than over Storybook's bare canvas.
 */
export function StoryFrame({
  children,
  entry = null,
  footer,
  dismissible = true,
}: {
  children: ReactNode;
  entry?: CreateProjectPageHeaderEntry | null;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  return (
    <div className="h-screen">
      <CreateProjectPage
        entry={entry}
        onClose={() => {}}
        dismissible={dismissible}
        {...(footer ? { footer } : {})}
      >
        {children}
      </CreateProjectPage>
    </div>
  );
}

export function useLinkedState(initial: ReadonlyArray<string>) {
  const [linked, setLinked] = useState(initial);
  return {
    linkedRepositoryUrls: linked,
    onToggleRepository: (url: string) =>
      setLinked((current) =>
        current.includes(url) ? current.filter((entry) => entry !== url) : [...current, url],
      ),
    onLinkRepositories: (urls: ReadonlyArray<string>) =>
      setLinked((current) => [...new Set([...current, ...urls])]),
  };
}

export function connectFixture(
  oauthState: OAuthState = { kind: "idle" },
  over: Partial<CreateProjectConnect> = {},
): CreateProjectConnect {
  return {
    oauth: {
      state: oauthState,
      startOAuth: async () => {},
      mintFreshSigninLink: async () => "",
      reset: () => {},
    },
    oauthConfigured: true,
    siteUrl: "https://acme.atlassian.net",
    setSiteUrl: () => {},
    email: "owner@acme.test",
    setEmail: () => {},
    apiToken: "",
    setApiToken: () => {},
    canConnectBasic: true,
    connecting: false,
    error: null,
    connectBasic: async () => {},
    ...over,
  };
}

export function ConnectFrame({
  connect,
  initialShowTokenForm,
}: {
  connect: CreateProjectConnect;
  initialShowTokenForm?: boolean;
}) {
  return (
    <CreateProjectConnectView
      connect={connect}
      {...(initialShowTokenForm ? { initialShowTokenForm } : {})}
    />
  );
}

/** Types into the page's search box the way a person would (React-controlled input). */
export async function typeInPageSearch(value: string) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  const input = document.querySelector<HTMLInputElement>(
    '[data-testid="create-project-page"] input[aria-label^="Search"]',
  );
  if (!input) return;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
