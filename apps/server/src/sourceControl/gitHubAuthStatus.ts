import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const GitHubAuthStatusAccountSchema = Schema.Struct({
  state: Schema.String,
  error: Schema.optional(Schema.String),
  active: Schema.Boolean,
  host: Schema.String,
  login: Schema.String,
});

const GitHubAuthStatusSchema = Schema.Struct({
  hosts: Schema.Record(Schema.String, Schema.Array(GitHubAuthStatusAccountSchema)),
});

const decodeGitHubAuthStatusJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(GitHubAuthStatusSchema),
);

export interface GitHubAuthStatusAccount {
  readonly host: string;
  readonly account: string;
  readonly authenticated: boolean;
  readonly active: boolean;
  readonly error: string | null;
}

export interface GitHubAuthStatus {
  readonly parsed: boolean;
  readonly accounts: ReadonlyArray<GitHubAuthStatusAccount>;
}

function nonEmptyString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseGitHubAuthStatus(text: string): GitHubAuthStatus {
  return Option.match(decodeGitHubAuthStatusJson(text), {
    onNone: () => ({ parsed: false, accounts: [] }),
    onSome: (status) =>
      ({
        parsed: true,
        accounts: Object.values(status.hosts).flatMap((accounts) =>
          accounts.flatMap((account) => {
            const host = nonEmptyString(account.host);
            const login = nonEmptyString(account.login);
            if (host === null || login === null) return [];

            return [
              {
                host: host.toLowerCase(),
                account: login,
                authenticated: account.state === "success",
                active: account.active,
                error: account.error?.trim() || null,
              },
            ];
          }),
        ),
      }) satisfies GitHubAuthStatus,
  });
}

export function findAuthenticatedGitHubAccount(
  accounts: ReadonlyArray<GitHubAuthStatusAccount>,
): GitHubAuthStatusAccount | undefined {
  return (
    accounts.find((account) => account.authenticated && account.active) ??
    accounts.find((account) => account.authenticated)
  );
}

/**
 * Every authenticated host from `gh auth status`, unlike {@link findAuthenticatedGitHubAccount}
 * which collapses the list down to a single (active-preferred) account. Used to surface a host
 * picker when a user is signed in to more than one host (e.g. `github.com` and a GitHub
 * Enterprise host).
 */
export function findAuthenticatedGitHubAccounts(
  accounts: ReadonlyArray<GitHubAuthStatusAccount>,
): ReadonlyArray<GitHubAuthStatusAccount> {
  return accounts.filter((account) => account.authenticated);
}
