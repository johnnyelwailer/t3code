/** Scope arithmetic for a GitHub token's `X-OAuth-Scopes` header, without ever touching the token. */
const IMPLIED: Readonly<Record<string, ReadonlyArray<string>>> = {
  "admin:org": ["write:org", "read:org"],
  "write:org": ["read:org"],
  "admin:public_key": ["write:public_key", "read:public_key"],
  "write:public_key": ["read:public_key"],
  "admin:repo_hook": ["write:repo_hook", "read:repo_hook"],
  "write:repo_hook": ["read:repo_hook"],
  user: ["read:user", "user:email", "user:follow"],
};

/** The scopes a header grants, with the ones each implies; `undefined` when the token reports none. */
export function grantedScopes(header: string | undefined): ReadonlySet<string> | undefined {
  if (header === undefined) return undefined;
  const listed = header
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
  return new Set(listed.flatMap((scope) => [scope, ...(IMPLIED[scope] ?? [])]));
}

export function missingScopes(
  granted: ReadonlySet<string> | undefined,
  requested: ReadonlyArray<string>,
): ReadonlyArray<string> {
  if (granted === undefined) return [];
  return requested.filter(
    (scope) => !granted.has(scope) && !(scope.startsWith("repo:") && granted.has("repo")),
  );
}

export const refreshCommand = (host: string, missing: ReadonlyArray<string>): string =>
  `gh auth refresh -h ${host} -s ${missing.join(",")}`;
