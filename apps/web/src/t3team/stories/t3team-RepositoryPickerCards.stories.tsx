import type { Meta, StoryObj } from "@storybook/react";

import type { GitHubRepositoryCandidate } from "~/t3team/backend/t3team-githubBackendTypes";
import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { LinkedRepositorySyncStatusLine } from "~/t3team/components/t3team-LinkedRepositorySyncStatusLine";
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

const GHE = "nexplore.ghe.com";
const repo = (
  host: string,
  nameWithOwner: string,
  description: string,
  isPrivate = true,
): GitHubRepositoryCandidate => ({
  id: `${host}/${nameWithOwner}`,
  nameWithOwner,
  url: `https://${host}/${nameWithOwner}`,
  host,
  description,
  isPrivate,
});

const CATALOG: ReadonlyArray<GitHubRepositoryCandidate> = [
  repo(GHE, "hive/ies-base-libs", "IES NG Product - subdomain dedicated to libraries"),
  repo(GHE, "hive/ies-base-notifications", "IES NG Product - in-app and email alerts"),
  repo(GHE, "hive/ies-base-objectstore", "IES NG Product - subdomain to store files/objects"),
  repo(GHE, "hive/ies-base-permalink", "IES NG Product - permalink configuring and mapping"),
  repo(GHE, "hive/common-agentdirectives", "Shared agent directives for every repository"),
  repo(GHE, "hive/ops", "Operations runbooks"),
  repo("github.com", "johnnyelwailer/t3code", "t3code, but for teams working together", false),
  repo(
    "github.com",
    "johnnyelwailer/sternenpfad-games",
    "Monorepo for story-driven programming games",
  ),
  repo(
    "github.com",
    "johnnyelwailer/songflow-companion",
    "Expo and TypeScript-first songwriting AI app",
  ),
  repo("github.com", "johnnyelwailer/knowledge", "Personal knowledge base"),
];

const LINKED = CATALOG.slice(0, 6).map((entry) => entry.url);

const syncByUrl = new Map<string, LinkedRepositorySyncResult>(
  LINKED.map((url, index): [string, LinkedRepositorySyncResult] => [
    url,
    index === 4
      ? { url, localPath: "/r", status: "pending", syncState: "cloning" }
      : { url, localPath: "/r", status: "cloned" },
  ]),
);

const discovery: GitHubDiscoveryState = {
  backendAvailable: true,
  signedIn: true,
  repositoriesFetchedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
  repositoriesRefreshing: false,
  githubHost: "github.com",
  githubAccount: "johnnyelwailer",
  authStatus: "authenticated",
  authDetail: undefined,
  loadingAuth: false,
  loadingDiscovery: false,
  suggestedUrls: [],
  visibleSuggestedUrls: [],
  catalog: CATALOG,
  discoveryWarning: undefined,
  authenticatedHosts: [
    { host: "github.com", account: "johnnyelwailer", active: true },
    { host: GHE, account: "pj", active: false },
  ],
  setGithubHost: () => {},
  selectHost: () => {},
  refresh: () => {},
};

/** The Linked repositories picker: selectable cards in a wrapping grid, sync state on each card. */
const meta = {
  title: "T3Team/Linked Repositories/Repository cards",
  component: RepositoryPicker,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story: () => React.ReactElement) => (
      <div className="flex h-[40rem] w-full max-w-6xl flex-col bg-card">
        <Story />
      </div>
    ),
  ],
  args: {
    discovery,
    linkedUrls: LINKED,
    onToggle: () => {},
    onLinkMany: () => {},
    renderLinkedStatus: (url: string) => (
      <LinkedRepositorySyncStatusLine entry={syncByUrl.get(url)} />
    ),
  },
} satisfies Meta<typeof RepositoryPicker>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LinkedAndAvailable: Story = {};
