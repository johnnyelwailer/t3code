import { type ReactNode, useMemo, useState } from "react";
import { Skeleton } from "~/t3team/components/ui/t3team-skeleton";
import { PickerSearchInput } from "~/t3team/components/t3team-PickerSearchInput";
import { PickerSection as Section } from "~/t3team/components/t3team-PickerSection";
import {
  buildRepositoryPickerEntries,
  entryFromUrl,
} from "~/t3team/components/t3team-repositoryPickerEntries";
import { RepositoryPickerSignInNotice } from "~/t3team/components/t3team-RepositoryPickerSignInNotice";
import { RepositoryPickerStatus } from "~/t3team/components/t3team-RepositoryPickerStatus";
import {
  RepositoryPickerRow,
  type RepositoryPickerEntry,
} from "~/t3team/components/t3team-RepositoryPickerRow";
import type { GitHubDiscoveryState } from "~/t3team/hooks/t3team-useGitHubRepositoryDiscovery";

const BROWSE_LIMIT = 30;
const SEARCH_LIMIT = 60;

/**
 * One search box over every signed-in host. Linked repos come first, then matches for the
 * project, then everything else the accounts can see. No host/account fields: hosts are
 * discovered from `gh`, and a pasted URL is linked as-is.
 */
export function RepositoryPicker({
  discovery,
  linkedUrls,
  onToggle,
  onLinkMany,
  renderLinkedStatus,
  renderLinkedControls,
}: {
  discovery: GitHubDiscoveryState;
  linkedUrls: ReadonlyArray<string>;
  onToggle: (url: string) => void;
  onLinkMany: (urls: ReadonlyArray<string>) => void;
  /** Extra line under a linked repository, e.g. its clone/sync state. */
  renderLinkedStatus?: (url: string) => ReactNode;
  /** Controls under a linked repository's status, e.g. which branch it follows. */
  renderLinkedControls?: (url: string) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const loading = discovery.authStatus === "checking" || discovery.loadingAuth;
  const linked = useMemo(() => new Set(linkedUrls), [linkedUrls]);

  const entries = useMemo(
    () => buildRepositoryPickerEntries(discovery.catalog, linkedUrls, discovery.suggestedUrls),
    [discovery.catalog, discovery.suggestedUrls, linkedUrls],
  );

  const hostCount = new Set(discovery.authenticatedHosts.map((entry) => entry.host)).size;
  const showHost = hostCount > 1 || new Set([...entries.values()].map((e) => e.host)).size > 1;
  const needle = query.trim().toLowerCase();
  const pastedUrl = /^(https?:\/\/|git@)\S+$/i.test(query.trim()) ? query.trim() : undefined;

  const linkedEntries = linkedUrls.flatMap((url) => entries.get(url) ?? []);
  const suggestedEntries = discovery.visibleSuggestedUrls.flatMap((url) => entries.get(url) ?? []);
  const otherEntries = [...entries.values()].filter(
    (entry) => !linked.has(entry.url) && !discovery.visibleSuggestedUrls.includes(entry.url),
  );
  const matches = needle
    ? [...entries.values()]
        .filter((entry) =>
          `${entry.name} ${entry.host} ${entry.description ?? ""}`.toLowerCase().includes(needle),
        )
        .slice(0, SEARCH_LIMIT)
    : [];

  const row = (entry: RepositoryPickerEntry, withHost = false) => (
    <RepositoryPickerRow
      key={entry.url}
      entry={entry}
      linked={linked.has(entry.url)}
      showHost={withHost && showHost}
      onToggle={onToggle}
      status={linked.has(entry.url) ? renderLinkedStatus?.(entry.url) : undefined}
      controls={linked.has(entry.url) ? renderLinkedControls?.(entry.url) : undefined}
    />
  );
  const otherByHost = new Map<string, RepositoryPickerEntry[]>();
  for (const entry of otherEntries.slice(0, BROWSE_LIMIT)) {
    otherByHost.set(entry.host, [...(otherByHost.get(entry.host) ?? []), entry]);
  }
  const repoCountByHost = new Map<string, number>();
  for (const entry of entries.values()) {
    repoCountByHost.set(entry.host, (repoCountByHost.get(entry.host) ?? 0) + 1);
  }

  const signedIn = discovery.signedIn;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 px-4 pb-3">
        <PickerSearchInput
          value={query}
          onChange={setQuery}
          label="Search repositories"
          placeholder="Search repositories"
        />
        <RepositoryPickerStatus
          discovery={discovery}
          loading={loading}
          repoCountByHost={repoCountByHost}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-2">
        {loading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : null}

        {!loading && !signedIn ? <RepositoryPickerSignInNotice discovery={discovery} /> : null}

        {pastedUrl && !linked.has(pastedUrl) && !entries.has(pastedUrl) ? (
          <Section title="Link this URL" layout="grid">
            {row(entryFromUrl(pastedUrl), true)}
          </Section>
        ) : null}

        {!loading && needle ? (
          matches.length > 0 ? (
            <Section title="Results" count={matches.length} layout="grid">
              {matches.map((entry) => row(entry, true))}
            </Section>
          ) : pastedUrl ? null : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {discovery.loadingDiscovery
                ? "Still loading repositories…"
                : `No repository matches “${query.trim()}”.`}
            </p>
          )
        ) : null}

        {!loading && !needle ? (
          <>
            {linkedEntries.length > 0 ? (
              <Section title="Linked" count={linkedEntries.length} layout="grid">
                {linkedEntries.map((entry) => row(entry, true))}
              </Section>
            ) : null}
            {suggestedEntries.length > 0 ? (
              <Section
                title="Suggested for this project"
                count={suggestedEntries.length}
                layout="grid"
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => onLinkMany(suggestedEntries.map((entry) => entry.url))}
                  >
                    Link all
                  </button>
                }
              >
                {suggestedEntries.map((entry) => row(entry))}
              </Section>
            ) : null}
            {otherEntries.length > 0 ? (
              <>
                {[...otherByHost].map(([host, list]) => (
                  <Section
                    key={host}
                    layout="grid"
                    title={
                      otherByHost.size > 1 ? `Your repositories · ${host}` : "Your repositories"
                    }
                  >
                    {list.map((entry) => row(entry))}
                  </Section>
                ))}
                {otherEntries.length > BROWSE_LIMIT ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">
                    {otherEntries.length - BROWSE_LIMIT} more — type to search
                  </p>
                ) : null}
              </>
            ) : null}
            {signedIn && !discovery.loadingDiscovery && entries.size === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {discovery.discoveryWarning ?? "No repositories found for your accounts."}
              </p>
            ) : null}
          </>
        ) : null}

        {discovery.discoveryWarning && entries.size > 0 ? (
          <p className="px-4 py-2 text-xs text-muted-foreground">{discovery.discoveryWarning}</p>
        ) : null}
      </div>
    </div>
  );
}
