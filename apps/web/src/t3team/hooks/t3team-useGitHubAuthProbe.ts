import { useEffect, useRef } from "react";
import { AsyncResult } from "effect/unstable/reactivity";
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
  const onAuthenticatedRef = useRef(onAuthenticated);

  useEffect(() => {
    onAuthenticatedRef.current = onAuthenticated;
  }, [onAuthenticated]);

  const environmentId = usePrimaryEnvironmentId();
  const discoverSourceControl = useAtomQueryRunner(sourceControlEnvironment.discovery, {
    reportFailure: false,
  });

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
          return;
        }
        const discoveryResult = await discoverSourceControl({
          environmentId,
          input: {},
        });
        if (AsyncResult.isFailure(discoveryResult)) {
          if (!cancelled) {
            setAuthStatus("unknown");
            setAuthDetail("Failed to inspect GitHub auth.");
          }
          return;
        }
        const discovery = discoveryResult.value;
        if (cancelled) return;
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
        if (auth.status === "authenticated") {
          await onAuthenticatedRef.current({
            host: auth.host ?? "github.com",
            account: auth.account,
            accounts: auth.accounts,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAuthStatus("unknown");
          setAuthDetail(error instanceof Error ? error.message : "Failed to inspect GitHub auth.");
        }
      } finally {
        if (!cancelled) setLoadingAuth(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    discoverSourceControl,
    enabled,
    environmentId,
    refreshKey,
    setAuthDetail,
    setAuthStatus,
    setAuthenticatedHosts,
    setGithubAccount,
    setGithubHost,
    setLoadingAuth,
  ]);
}
