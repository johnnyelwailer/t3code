import type { JiraCatalogProject, JiraCatalogSiteFailure } from "./t3team-jiraProjectCatalog.logic";

export type JiraSiteChipStatus = "ok" | "offline" | "auth-expired";

export type JiraSiteChip = {
  readonly id: string;
  readonly accountId: string;
  readonly label: string;
  readonly status: JiraSiteChipStatus;
  readonly error?: string;
};

/** Auth-expired vs a plain offline/unreachable failure, from the error text we already have. */
export function classifyJiraSiteFailure(error: string): Exclude<JiraSiteChipStatus, "ok"> {
  const text = error.toLowerCase();
  if (/(auth|unauthor|401|403|expired|token|sign[ -]?in|login|oauth|forbidden)/.test(text)) {
    return "auth-expired";
  }
  return "offline";
}

/**
 * One chip per Jira site: every site in the catalog, plus any site that failed
 * to load. A failure overwrites a successful cached row so the chip can say so.
 */
export function collectJiraSiteChips(
  catalog: ReadonlyArray<Pick<JiraCatalogProject, "accountId" | "siteHost">>,
  siteFailures: ReadonlyArray<JiraCatalogSiteFailure> = [],
): ReadonlyArray<JiraSiteChip> {
  const chips = new Map<string, JiraSiteChip>();
  for (const entry of catalog) {
    if (chips.has(entry.accountId)) continue;
    chips.set(entry.accountId, {
      id: entry.accountId,
      accountId: entry.accountId,
      label: entry.siteHost ?? "Jira",
      status: "ok",
    });
  }
  for (const failure of siteFailures) {
    chips.set(failure.accountId, {
      id: failure.accountId,
      accountId: failure.accountId,
      label: failure.siteHost ?? failure.label,
      status: classifyJiraSiteFailure(failure.error),
      error: failure.error,
    });
  }
  return [...chips.values()];
}

export function shouldShowJiraSiteChips(chips: ReadonlyArray<JiraSiteChip>): boolean {
  return chips.length >= 2;
}

export function toggleJiraSiteFilter(current: string | null, clicked: string): string | null {
  return current === clicked ? null : clicked;
}

export function catalogForJiraSite<T extends { readonly accountId: string }>(
  catalog: ReadonlyArray<T>,
  selectedAccountId: string | null,
): ReadonlyArray<T> {
  return selectedAccountId === null
    ? catalog
    : catalog.filter((entry) => entry.accountId === selectedAccountId);
}

export function jiraSiteChipStatusLabel(status: JiraSiteChipStatus): string | null {
  if (status === "offline") return "Offline";
  if (status === "auth-expired") return "Sign-in expired";
  return null;
}
