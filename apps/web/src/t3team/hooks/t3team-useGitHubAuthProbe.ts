import { useEffect } from "react";
import { useLatest } from "./t3team-useLatest";
import { AsyncResult } from "effect/reactivity";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { writeIntegrationCache } from "./t3team-integrationCache";
import { parseGitHubAuth, type GitHubAuthAccount } from "./t3team-githubRepositoryDiscoveryUtils";

export type GitHubAuthStatus = "checking" | "authenticated" | "unauthenticated" | "unknown";

/**
 * Probes `gh auth status` (via the source-control discovery atom) once per mount/enable toggle.
 * Split out of `useGitHubRepositoryDiscovery` to keep that hook under the additive LOC cap. State
 * stays owned by the caller (via the setters below) since `githubHost` / `githubAccount` are also
 * mutated by cache restore, manual host entry, and suggestion discovery.
 */
export function useGitHubAuthProbe(params: {
  readonly enabled: boolean;
  readonly refreshKey?: string;
  readonly onAuthenticated: (input: {
    readonly host: string;
    readonly account: string | undefined;
    readonly accounts: ReadonlyArray<GitHubAuthAccount>;
  }) => void | Promise<void>;
  readonly setAuthStatus: (status: GitHubAuthStatus) => void;
  readonly setAuthDetail: (detail: string | undefined) => void;
  readonly setLoadingAuth: (loading: boolean) => void;
  readonly setGithubHost: (host: string) => void;
  readonly setGithubAccount: (account: string | undefined) => void;
  readonly setAuthenticatedHosts: (hosts: ReadonlyArray<GitHubAuthAccount>) => void;
}): void {
  const {
    enabled,
    refreshKey,
    onAuthenticated,
    setAuthStatus,
    setAuthDetail,
    setLoadingAuth,
    setGithubHost,
    setGithubAccount,
    setAuthenticatedHosts,
  } = params;
  const onAuthenticatedRef = useLatest(onAuthenticated);

  const environmentId = usePrimaryEnvironmentId();
  // A probe runs on mount and on Recheck, both asking because gh may have changed since: the
  // shared discovery atom's cached answer (kept alive by any other reader) is not one.
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
    refresh: true,
  });
  // The runner's identity is not stable from this uncompiled hook (inline options). A dep
  // on the runner retriggers the probe on every render; the effect setStates, which
  // re-renders, which retriggers — a tight loop that freezes the window. Hold the runner
  // in a latest-ref (stable object) and list the ref, not the runner, in the deps.
  const discoverSourceControlRef = useLatest(discoverSourceControl);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps GitHub auth and the catalog in step with gh, once per mount or Recheck, not on every render
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const run = async () => {
      setLoadingAuth(true);
      try {
        if (environmentId === null) {
          if (!cancelled) {
            setAuthStatus("unknown");
            setAuthDetail("Server environment is unavailable.");
          }
        } else {
          const discoveryResult = await discoverSourceControlRef.current({
            environmentId,
            input: {},
          });
          if (AsyncResult.isFailure(discoveryResult)) {
            if (!cancelled) {
              setAuthStatus("unknown");
              setAuthDetail("Failed to inspect GitHub auth.");
            }
          } else {
            const discovery = discoveryResult.value;
            if (!cancelled) {
              const auth = parseGitHubAuth(discovery);
              writeIntegrationCache("github:auth", {
                githubHost: auth.host ?? "github.com",
                ...(auth.account ? { githubAccount: auth.account } : {}),
                authStatus: auth.status,
                ...(auth.detail ? { authDetail: auth.detail } : {}),
                accounts: auth.accounts,
              });
              setAuthStatus(auth.status);
              setAuthDetail(auth.detail);
              setGithubHost(auth.host ?? "github.com");
              setGithubAccount(auth.account);
              setAuthenticatedHosts(auth.accounts);
              if (auth.status === "authenticated" || auth.accounts.length > 0) {
                await onAuthenticatedRef.current({
                  host: auth.host ?? "github.com",
                  account: auth.account,
                  accounts: auth.accounts,
                });
              }
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAuthStatus("unknown");
          setAuthDetail(error instanceof Error ? error.message : "Failed to inspect GitHub auth.");
        }
      }
      // No `finally`: the compiler cannot lower try/finally. This runs on every path,
      // including the catch, which is what the finally used to do.
      if (!cancelled) setLoadingAuth(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    discoverSourceControlRef,
    enabled,
    environmentId,
    onAuthenticatedRef,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Recheck token: changing it re-runs the probe on purpose; the effect does not read the key
    refreshKey,
    setAuthDetail,
    setAuthStatus,
    setAuthenticatedHosts,
    setGithubAccount,
    setGithubHost,
    setLoadingAuth,
  ]);
}
