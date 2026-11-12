import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * The desktop route: a cloud-session agent asks the user to let one host be reached through the
 * user's own computer. Opt-in behind the `AGENTS_DESKTOP_ROUTE` flag: off, no thread sees it.
 */
export const IMPLEMENTED_T3TEAM_DESKTOP_ROUTE_TOOL_CATALOG = {
  "t3team.desktop_route.request": {
    id: "t3team.desktop_route.request",
    label: "Request a desktop route",
    title: "Ask the user to let one host be reached through their own computer",
    description:
      "Use only when a host you need is unreachable from this cloud session (a connection failed " +
      "on DNS, connect or TLS), for example an internal package registry. Asks the user one " +
      "question: once, for this session, always for this host, or not. Nothing is routed by this " +
      "tool: never tell the user it was applied. Their answer arrives as their next message; wait " +
      "for it, then run the failing command again. Name ONE host, URL, IP or small range, never " +
      "a wildcard, and say in 'reason' what fails. Set 'internal' when the host is an internal " +
      "address that resolves to a private network address. Returns {asked, requestId, " +
      "questionId, target, note}. One question can be pending per thread.",
    capabilities: ["write"],
    kind: "thread",
    surfaces: ["thread", "project"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["target", "reason"],
      properties: {
        target: {
          type: "string",
          minLength: 1,
          maxLength: 300,
          description: "One host name, URL, IP address or small range. No wildcards.",
        },
        reason: {
          type: "string",
          minLength: 1,
          description:
            "One or two sentences the user reads: what fails and why this host is needed.",
        },
        internal: {
          type: "boolean",
          description: "True when the host is internal and resolves to a private network address.",
        },
      },
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
