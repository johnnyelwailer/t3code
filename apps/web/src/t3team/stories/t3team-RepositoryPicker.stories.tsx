import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { X } from "lucide-react";

import { RepositoryPicker } from "~/t3team/components/t3team-RepositoryPicker";
import { Button } from "~/t3team/components/ui/t3team-button";
import { Card } from "~/t3team/components/ui/t3team-card";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

const repo = (host: string, name: string, description: string, isPrivate = true, day = 1) => ({
  id: `${host}/${name}`,
  nameWithOwner: name,
  url: `https://${host}/${name}`,
  host,
  description,
  isPrivate,
  updatedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
});

const catalog = [
  ...["alarm", "base-libs", "base-config", "base-notifications", "stammdaten"].map((n, i) =>
    repo("nexplore.ghe.com", `hive/ies-${n}`, `IES ${n} module`, true, 5 - i),
  ),
  repo("nexplore.ghe.com", "pj/nexi-distribution", "Nexi desktop distribution", true, 6),
  repo("github.com", "djangal/songflow", "Music practice app", false, 4),
  repo("github.com", "johnnyelwailer/t3code", "Fork of t3code", false, 6),
];

const base = (over: Partial<GitHubDiscoveryState>): GitHubDiscoveryState =>
  ({
    backendAvailable: true,
    githubHost: "github.com",
    authStatus: "authenticated",
    loadingAuth: false,
    loadingDiscovery: false,
    suggestedUrls: [],
    visibleSuggestedUrls: [],
    catalog,
    authenticatedHosts: [
      { host: "github.com", account: "djangal", active: true },
      { host: "nexplore.ghe.com", account: "pj", active: false },
    ],
    refresh: () => {},
    ...over,
  }) as GitHubDiscoveryState;

const suggested = catalog.slice(0, 5).map((r) => r.url);

function Frame({
  discovery,
  initial = [],
}: {
  discovery: GitHubDiscoveryState;
  initial?: string[];
}) {
  const [linked, setLinked] = useState<ReadonlyArray<string>>(initial);
  const visible = discovery.visibleSuggestedUrls.filter((u) => !linked.includes(u));
  return (
    <div className="flex min-h-screen items-center justify-center bg-black/50 p-4">
      <Card className="flex h-[40rem] w-full max-w-2xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div>
            <h2 className="text-base font-semibold">Linked repositories</h2>
            <p className="text-xs text-muted-foreground">
              Code, PRs and branches for IES NG come from these.
            </p>
          </div>
          <X className="size-4" />
        </header>
        <RepositoryPicker
          discovery={{ ...discovery, visibleSuggestedUrls: visible }}
          linkedUrls={linked}
          onToggle={(u) => setLinked((c) => (c.includes(u) ? c.filter((x) => x !== u) : [...c, u]))}
          onLinkMany={(urls) => setLinked((c) => [...new Set([...c, ...urls])])}
        />
        <footer className="flex items-center justify-between border-t border-border bg-card px-5 py-3.5">
          <span className="text-xs text-muted-foreground">{linked.length} linked</span>
          <div className="flex gap-2">
            <Button variant="ghost">Cancel</Button>
            <Button>Save</Button>
          </div>
        </footer>
      </Card>
    </div>
  );
}

const meta = {
  title: "T3Team/Repository Picker",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestedAndLinked: Story = {
  render: () => (
    <Frame
      discovery={base({ suggestedUrls: suggested, visibleSuggestedUrls: suggested })}
      initial={[catalog[5]!.url]}
    />
  ),
};
export const Searching: Story = {
  render: () => <Frame discovery={base({})} initial={[catalog[0]!.url]} />,
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector("input")!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, "ies");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  },
};
export const SignedOut: Story = {
  render: () => (
    <Frame
      discovery={base({ authStatus: "unauthenticated", catalog: [], authenticatedHosts: [] })}
    />
  ),
};
export const Loading: Story = {
  render: () => <Frame discovery={base({ loadingAuth: true, authStatus: "checking" })} />,
};
