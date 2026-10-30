/** Scope arithmetic for a GitHub token's `X-OAuth-Scopes` header, without ever touching the token. */
const IMPLIED: Readonly<Record<string, ReadonlyArray<string>>> = {
  repo: ["public_repo", "repo_deployment", "repo:status", "repo:invite", "security_events"],
  "admin:org": ["write:org", "read:org"],
  "write:org": ["read:org"],
  "admin:public_key": ["write:public_key", "read:public_key"],
  "write:public_key": ["read:public_key"],
  "admin:repo_hook": ["write:repo_hook", "read:repo_hook"],
  "write:repo_hook": ["read:repo_hook"],
  "admin:gpg_key": ["write:gpg_key", "read:gpg_key"],
  "write:gpg_key": ["read:gpg_key"],
  "write:discussion": ["read:discussion"],
  project: ["read:project"],
  user: ["read:user", "user:email", "user:follow"],
};

/** The scopes a header grants, with the ones each implies; `undefined` when the token reports none. */
export function grantedScopes(header: string | undefined): ReadonlySet<string> | undefined {
  if (header === undefined) return undefined;
  const listed = header
    .split(",")
    .map((scope) => scope.trim().toLowerCase())
    .filter((scope) => scope !== "");
  return new Set(listed.flatMap((scope) => [scope, ...(IMPLIED[scope] ?? [])]));
}

export function missingScopes(
  granted: ReadonlySet<string> | undefined,
  requested: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (granted === undefined) return [];
  const wanted = [...new Set(requested.map((scope) => scope.toLowerCase()))];
  return wanted.filter((scope) => !granted.has(scope));
}

export const refreshCommand = (host: string, missing: ReadonlyArray<string>): string =>
  `gh auth refresh -h ${host} -s ${missing.join(",")}`;
