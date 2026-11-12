/**
 * Optimistic state for switching the project's main repository in one click: the new main
 * appears at once, a pending flag follows, and a finished persist either keeps it or, on
 * failure, shows a plain error with Retry and reverts to the previous main (unless the
 * previous main was just unlinked, in which case the promoted main stays and Retry repeats
 * the persist).
 */

export const MAIN_REPOSITORY_PERSIST_ERROR = "Could not switch the main repository.";

export type MainRepositoryOptimisticState = {
  readonly mainUrl: string | null;
  /** Last successfully persisted (or initial) main; the revert target on a failed Make main. */
  readonly committedUrl: string | null;
  /** The main being persisted; `undefined` means nothing is in flight. */
  readonly pendingUrl: string | null | undefined;
  readonly error: { readonly url: string | null; readonly message: string } | null;
  /** When false, a failed persist keeps the optimistic main (the previous one was unlinked). */
  readonly revertOnFailure: boolean;
};

export function initialMainOptimisticState(
  committedUrl: string | null,
): MainRepositoryOptimisticState {
  return {
    mainUrl: committedUrl,
    committedUrl,
    pendingUrl: undefined,
    error: null,
    revertOnFailure: true,
  };
}

export function isMainPersistPending(state: MainRepositoryOptimisticState): boolean {
  return state.pendingUrl !== undefined;
}

/** Instant visible reaction: show `nextUrl` as main and mark the persist pending. */
export function beginMainPersist(
  state: MainRepositoryOptimisticState,
  nextUrl: string | null,
  revertOnFailure = true,
): MainRepositoryOptimisticState {
  return {
    mainUrl: nextUrl,
    committedUrl: state.committedUrl,
    pendingUrl: nextUrl,
    error: null,
    revertOnFailure,
  };
}

export function completeMainPersist(
  state: MainRepositoryOptimisticState,
  persistedUrl: string | null,
): MainRepositoryOptimisticState {
  return {
    mainUrl: persistedUrl,
    committedUrl: persistedUrl,
    pendingUrl: undefined,
    error: null,
    revertOnFailure: true,
  };
}

export function failMainPersist(
  state: MainRepositoryOptimisticState,
  message: string = MAIN_REPOSITORY_PERSIST_ERROR,
): MainRepositoryOptimisticState {
  const tried = state.pendingUrl === undefined ? state.mainUrl : state.pendingUrl;
  const mainUrl = state.revertOnFailure ? state.committedUrl : state.mainUrl;
  return {
    mainUrl,
    committedUrl: state.committedUrl,
    pendingUrl: undefined,
    error: { url: tried, message },
    revertOnFailure: state.revertOnFailure,
  };
}

/** The URL a Retry should persist: the one that failed. */
export function retryMainPersistUrl(state: MainRepositoryOptimisticState): string | null | undefined {
  return state.error ? state.error.url : undefined;
}

export function persistErrorMessage(error: unknown): string {
  return MAIN_REPOSITORY_PERSIST_ERROR;
}

/** Record a main locally (for example the first unsaved linked repo) without a persist. */
export function setMainLocally(
  state: MainRepositoryOptimisticState,
  nextUrl: string | null,
): MainRepositoryOptimisticState {
  return { ...state, mainUrl: nextUrl, error: null, pendingUrl: undefined };
}

/** A main can be persisted now when it is already a saved linked repository, or when clearing. */
export function canPersistMainRepositoryNow(
  url: string | null,
  savedLinkedUrls: ReadonlyArray<string>,
): boolean {
  return url === null || savedLinkedUrls.includes(url);
}
