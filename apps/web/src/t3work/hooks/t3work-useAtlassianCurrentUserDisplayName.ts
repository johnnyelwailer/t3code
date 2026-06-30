import { useEffect, useState } from "react";
import type { IntegrationAccount } from "@t3tools/integrations-core";

import { useBackend } from "~/t3work/backend/t3work-index";
import {
  readIntegrationCache,
  writeIntegrationCache,
} from "~/t3work/hooks/t3work-integrationCache";

export function findAtlassianAccountDisplayName(
  accounts: ReadonlyArray<IntegrationAccount>,
  accountId?: string,
): string | undefined {
  if (!accountId) {
    return undefined;
  }

  const normalizedAccountId = accountId.trim().replace(/\/+$/, "").toLocaleLowerCase();
  return accounts.find((account) => {
    if (account.id.trim().toLocaleLowerCase() === normalizedAccountId) {
      return true;
    }
    const accountUrl = account.accountUrl?.trim().replace(/\/+$/, "").toLocaleLowerCase();
    return accountUrl === normalizedAccountId;
  })?.label;
}

export function readCachedAtlassianCurrentUserDisplayName(accountId?: string): string | undefined {
  const cachedAccounts =
    readIntegrationCache<ReadonlyArray<IntegrationAccount>>("atlassian:listAccounts")?.value ?? [];

  return findAtlassianAccountDisplayName(cachedAccounts, accountId);
}

export function useAtlassianCurrentUserDisplayNameState(accountId?: string): {
  displayName: string | undefined;
  loading: boolean;
} {
  const backend = useBackend();
  const [displayName, setDisplayName] = useState<string | undefined>(() =>
    readCachedAtlassianCurrentUserDisplayName(accountId),
  );
  const [loading, setLoading] = useState<boolean>(() => {
    if (!accountId) {
      return false;
    }

    return readCachedAtlassianCurrentUserDisplayName(accountId) === undefined;
  });

  useEffect(() => {
    let cancelled = false;
    const cachedDisplayName = readCachedAtlassianCurrentUserDisplayName(accountId);

    setDisplayName(cachedDisplayName);

    if (!backend || !accountId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(cachedDisplayName === undefined);

    void backend.atlassian
      .listAccounts()
      .then((accounts) => {
        if (cancelled) return;
        writeIntegrationCache("atlassian:listAccounts", accounts);
        setDisplayName(findAtlassianAccountDisplayName(accounts, accountId));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, backend]);

  return { displayName, loading };
}

export function useAtlassianCurrentUserDisplayName(accountId?: string): string | undefined {
  return useAtlassianCurrentUserDisplayNameState(accountId).displayName;
}
