export type T3TeamToolCapability = "read" | "write";
export type T3TeamToolKind =
  | "read"
  | "view-state"
  | "draft-mutation"
  | "thread"
  | "external-convenience";
export type T3TeamToolSurface =
  | "thread"
  | "project"
  | "backlog"
  | "my-work"
  | "work-item"
  | "github";
export type T3TeamToolStatus = "implemented" | "planned";

export type T3TeamToolCatalogEntry = {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly capabilities: ReadonlyArray<T3TeamToolCapability>;
  readonly kind: T3TeamToolKind;
  readonly surfaces: ReadonlyArray<T3TeamToolSurface>;
  readonly status: T3TeamToolStatus;
  readonly defaultEnabled?: boolean;
  readonly inputSchema: unknown;
};

const READ_CAPABILITIES = ["read"] as const;
const WRITE_CAPABILITIES = ["write"] as const;

export const EMPTY_OBJECT_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

function defaultCapabilitiesForKind(kind: T3TeamToolKind): ReadonlyArray<T3TeamToolCapability> {
  return kind === "read" ? READ_CAPABILITIES : WRITE_CAPABILITIES;
}

function titleCaseToken(token: string): string {
  switch (token) {
    case "github":
      return "GitHub";
    case "jira":
      return "Jira";
    case "jql":
      return "JQL";
    default:
      return token.charAt(0).toUpperCase() + token.slice(1);
  }
}

function humanizeToolId(id: string): string {
  return id
    .replace(/^t3team\./, "")
    .split(".")
    .flatMap((segment) => segment.split("_"))
    .map(titleCaseToken)
    .join(" ");
}

export function definePlannedTools(input: {
  readonly kind: T3TeamToolKind;
  readonly surfaces: ReadonlyArray<T3TeamToolSurface>;
  readonly ids: ReadonlyArray<string>;
}): ReadonlyArray<T3TeamToolCatalogEntry> {
  return input.ids.map((id) => {
    const title = humanizeToolId(id);
    return {
      id,
      label: title,
      title,
      description: `Planned ${title.toLowerCase()} tool.`,
      capabilities: defaultCapabilitiesForKind(input.kind),
      kind: input.kind,
      surfaces: input.surfaces,
      status: "planned",
      inputSchema: EMPTY_OBJECT_INPUT_SCHEMA,
    } satisfies T3TeamToolCatalogEntry;
  });
}

export function hasT3TeamToolSurface(
  tool: T3TeamToolCatalogEntry,
  surface: T3TeamToolSurface,
): boolean {
  return tool.surfaces.some((candidate) => candidate === surface);
}

/**
 * Surfaces that only make sense against a real work source (Jira/Atlassian, Linear, a
 * GitHub-managed project, ...). A loose local workspace has no backlog, no "my work" queue, and
 * no work items behind it. The single canonical definition — both the web client's tool-visibility
 * gate (`apps/web/src/t3team/t3team-toolPolicy.ts`) and the server's workflow host-tool
 * availability gate (`apps/server/src/t3team-workflowHostToolAvailability.ts`) import this rather
 * than keeping their own copy, so the two can never drift apart.
 */
export const WORK_SOURCE_ONLY_T3TEAM_TOOL_SURFACES: ReadonlySet<T3TeamToolSurface> = new Set([
  "backlog",
  "my-work",
  "work-item",
]);

/**
 * ANY work-source surface disqualifies the tool, not all of them.
 *
 * `surfaces` does double duty in the catalog: it names the UI surface a tool belongs to AND acts
 * as a selector for a set (`DEFAULT_T3TEAM_THREAD_TOOL_IDS` is everything tagged `"thread"`). So a
 * work-item tool offered to thread agents is tagged `["work-item", "thread"]` —
 * `t3team.work_item.refresh_context_bundle` is exactly that, and it is the one work-source tool in
 * the default thread set. Requiring *every* surface to be work-source-only would let it through
 * and make this gate a no-op.
 */
export function requiresWorkSourceT3TeamTool(tool: T3TeamToolCatalogEntry): boolean {
  return tool.surfaces.some((surface) => WORK_SOURCE_ONLY_T3TEAM_TOOL_SURFACES.has(surface));
}
