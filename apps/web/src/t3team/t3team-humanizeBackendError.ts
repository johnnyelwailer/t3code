/**
 * Plain-language wording for the transport and integration errors the t3team
 * surfaces receive as raw strings ("Failed to reach backend /api/... Fetch
 * error: ...", "Token refresh failed (403): {...}"). The raw text stays
 * available as `detail` for people who need it; the `title` is what a person
 * who did not write the code should read first.
 */

export type HumanizedBackendError = {
  readonly title: string;
  readonly detail?: string;
};

const RULES: ReadonlyArray<{ readonly test: RegExp; readonly title: string }> = [
  {
    test: /Failed to reach backend|Fetch error|NetworkError|ECONNREFUSED|502|Bad Gateway/i,
    title: "The server is not reachable right now. Check that it is running, then retry.",
  },
  {
    test: /Token refresh failed|refresh_token is invalid|unauthorized_client|401|403/i,
    title: "Your Jira session has expired. Sign in again under Settings → Connected tools.",
  },
  {
    test: /prepare statement|no such (table|column)/i,
    title: "The server database is out of date. Update and restart the server.",
  },
  {
    test: /does not support|not available on the running backend|404/i,
    title: "The running server is older than this app. Update and restart the server.",
  },
];

export function humanizeT3TeamBackendError(raw: string | undefined): HumanizedBackendError {
  const message = raw?.trim() ?? "";
  if (message === "") return { title: "Something went wrong while loading." };
  const rule = RULES.find((candidate) => candidate.test.test(message));
  if (rule === undefined) return { title: message };
  return { title: rule.title, detail: message };
}
