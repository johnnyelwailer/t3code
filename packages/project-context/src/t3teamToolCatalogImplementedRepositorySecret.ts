import type { T3TeamToolCatalogEntry } from "./t3teamToolCatalogCore.ts";

/**
 * Tools that write repository Actions secrets on the host. Off by default: a thread gains one
 * only when a user selects it or a launching recipe declares `mutation.repository_secret`.
 */
export const IMPLEMENTED_T3TEAM_REPOSITORY_SECRET_TOOL_CATALOG = {
  "t3team.repository_secret.set": {
    id: "t3team.repository_secret.set",
    label: "Set repository secret",
    title: "Ask for a secret and save it as a repository Actions secret",
    description:
      "Dock a masked secret input on this thread (the agent never sees the value). When the user " +
      "saves, write the value as a repository Actions secret named `name` on the checkout's origin " +
      "host via `gh secret set` (value on stdin only). If the secret already exists, returns " +
      "`already_present` without asking. If the signed-in account lacks admin permission to set " +
      "secrets, returns `permission_denied` so the user can ask an admin. Returns " +
      "{status, name, detail?} where status is saved | declined | permission_denied | " +
      "already_present | unavailable.",
    capabilities: ["write"],
    kind: "mutation",
    surfaces: ["thread"],
    status: "implemented",
    defaultEnabled: false,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: {
          type: "string",
          minLength: 1,
          description: "Actions secret name: upper-case identifier, not starting with GITHUB_.",
        },
        label: {
          type: "string",
          minLength: 1,
          description: "Short label on the secret card (name only; never a value).",
        },
        reason: {
          type: "string",
          minLength: 1,
          description: "Why the machine needs this secret (shown on the card).",
        },
        placeholder: {
          type: "string",
          description: "Hint inside the masked input.",
        },
        timeoutMs: {
          type: "integer",
          minimum: 1000,
          maximum: 3600000,
          description: "How long to wait for the user. Default 10 minutes.",
        },
        clientRequestId: {
          type: "string",
          description:
            "Reuse when retrying so the user sees one card; use a new id to ask again after decline or timeout.",
        },
      },
      required: ["name", "label", "reason"],
    },
  },
} as const satisfies Record<string, T3TeamToolCatalogEntry>;
