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
