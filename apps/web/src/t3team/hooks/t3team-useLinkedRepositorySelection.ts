import { useCallback, useState } from "react";

import { splitRepositoryInput } from "~/t3team/components/t3team-linkedRepositories";

import { normalizeRepositoryUrls } from "./t3team-createProjectBootstrap";

const NO_URLS: ReadonlyArray<string> = [];

/** Row click on the repository picker: link the repository, or unlink it when it already is. */
export function toggleRepositoryUrl(
  urls: ReadonlyArray<string>,
  url: string,
): ReadonlyArray<string> {
  return urls.includes(url)
    ? urls.filter((entry) => entry !== url)
    : normalizeRepositoryUrls([...urls, ...splitRepositoryInput(url)]);
}

export function linkRepositoryUrls(
  urls: ReadonlyArray<string>,
  more: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return normalizeRepositoryUrls([...urls, ...more]);
}

/**
 * The set of linked repositories behind a `RepositoryPicker`.
 *
 * `scopeKey` names what the selection belongs to (a project). When it changes the selection starts
 * over — a repository picked for project A must never ship on project B — and it does so in the
 * same render, not an effect later, so a stale list is never drawn for one frame.
 */
export function useLinkedRepositorySelection(
  scopeKey?: string,
  initial: ReadonlyArray<string> = NO_URLS,
) {
  const [state, setState] = useState(() => ({
    scopeKey,
    urls: normalizeRepositoryUrls(initial),
  }));
  const linkedRepositoryUrls = state.scopeKey === scopeKey ? state.urls : NO_URLS;

  const update = useCallback(
    (change: (urls: ReadonlyArray<string>) => ReadonlyArray<string>) =>
      setState((previous) => ({
        scopeKey,
        urls: change(previous.scopeKey === scopeKey ? previous.urls : NO_URLS),
      })),
    [scopeKey],
  );

  return {
    linkedRepositoryUrls,
    toggleRepository: useCallback(
      (url: string) => update((urls) => toggleRepositoryUrl(urls, url)),
      [update],
    ),
    linkRepositories: useCallback(
      (more: ReadonlyArray<string>) => update((urls) => linkRepositoryUrls(urls, more)),
      [update],
    ),
  };
}
