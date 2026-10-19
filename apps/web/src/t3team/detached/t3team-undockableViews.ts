/**
 * Which routed views open in a window of their own ("Open in new window"), keyed by route path
 * as `routes/` names it. Every route has an entry — the test fails for one that does not — so a
 * new route is a decision, not an accident. An excluded route says why.
 */
export type UndockPolicy =
  | { readonly undock: true; readonly title: (route: UndockRoute) => string }
  | { readonly undock: false; readonly reason: string };

export interface UndockRoute {
  /** The route's path params, by name. */
  readonly segments: Readonly<Record<string, string>>;
  readonly search: URLSearchParams;
}

const undockAs = (title: string | ((route: UndockRoute) => string)): UndockPolicy => ({
  undock: true,
  title: typeof title === "string" ? () => title : title,
});
const stays = (reason: string): UndockPolicy => ({ undock: false, reason });

const REDIRECTS = "redirects to a Team route, which is the one that undocks";
const SIGN_IN = "a sign-in or pairing step; it belongs to the window that asked for it";

/** The Team home shows the selected project's dashboard, so both are titled by its lens. */
const dashboardTitle = ({ search }: UndockRoute) =>
  search.get("projectView") === "backlog" ? "Backlog" : "My Work";

export const UNDOCK_POLICY: Readonly<Record<string, UndockPolicy>> = {
  "/t3team": undockAs(dashboardTitle),
  "/t3team/my-work": undockAs("My Work"),
  "/t3team/projects/$projectId": undockAs(dashboardTitle),
  "/t3team/projects/$projectId/tickets/$ticketId": undockAs(
    ({ segments }) => segments.ticketId ?? "Work item",
  ),
  "/t3team/projects/$projectId/threads/$threadId": undockAs("Thread"),
  "/pull-requests": undockAs("Pull requests"),
  "/usage": undockAs("Usage"),
  "/settings": undockAs("Settings"),
  "/settings/$section": undockAs("Settings"),
  "/t3team/new": stays("creating a project is a short form that ends by navigating to it"),
  "/t3team/drafts/$draftId": stays(
    "a draft's first send moves it onto the new thread; undock the thread once it exists",
  ),
  "/t3team-detached/$kind": stays("already a window of its own"),
  "/": stays(REDIRECTS),
  "/new": stays("a prompt-link landing that turns into a draft; undock the thread instead"),
  "/draft/$draftId": stays(REDIRECTS),
  "/$environmentId/$threadId": stays(REDIRECTS),
  "/projects/$projectKey": stays("redirects to project settings"),
  "/welcome": stays("first-run setup runs once, in the main window"),
  "/pair": stays(SIGN_IN),
  "/connect": stays(SIGN_IN),
  "/connect-agent": stays(SIGN_IN),
  "/oauth/callback": stays(SIGN_IN),
};

function matchSegments(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const segments: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? "";
    if (part.startsWith("$")) segments[part.slice(1)] = decodeURIComponent(actual);
    else if (part !== actual) return null;
  }
  return segments;
}

const staticPartCount = (pattern: string) =>
  pattern.split("/").filter((part) => part !== "" && !part.startsWith("$")).length;

const PATTERNS_BY_SPECIFICITY = Object.keys(UNDOCK_POLICY).toSorted(
  (left, right) => staticPartCount(right) - staticPartCount(left),
);

/**
 * The policy for a pathname (settings sections share `/settings/$section`), with the pattern
 * it matched and the route params; the most specific route wins.
 */
export function undockPolicyForPath(pathname: string): {
  readonly pattern: string;
  readonly policy: UndockPolicy;
  readonly segments: Readonly<Record<string, string>>;
} | null {
  for (const pattern of PATTERNS_BY_SPECIFICITY) {
    const segments = matchSegments(pattern, pathname);
    const policy = UNDOCK_POLICY[pattern];
    if (segments !== null && policy !== undefined) return { pattern, policy, segments };
  }
  return null;
}
