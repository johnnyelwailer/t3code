import { useState } from "react";

import { type GitHubSignIn, useGitHubSignIn } from "~/t3team/hooks/t3team-useGitHubSignIn";

/**
 * gh reports one host at a time: while another host signs in, this host's state reads as not
 * started. The page keeps the connected state it last saw for the host, so a signed-in row does
 * not fall back to "Sign in" while the other row is busy.
 */
export function useWelcomeGitHubSignIn(host: string): GitHubSignIn {
  const signIn = useGitHubSignIn(host);
  const [connected, setConnected] = useState<GitHubSignIn["state"]>(undefined);
  const live = signIn.state;
  if (live?.phase === "connected" && live.account !== connected?.account) setConnected(live);
  return { ...signIn, state: live ?? connected };
}
