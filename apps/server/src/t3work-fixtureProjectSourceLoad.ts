// @effect-diagnostics nodeBuiltinImport:off - the fixture project source reads a plain directory.
// @effect-diagnostics preferSchemaOverJson:off - fixture bundles are unknown JSON blobs.
import type { ProjectShellProject } from "@t3tools/project-context";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export type T3workFixtureTicket = {
  readonly id: string;
  readonly projectId?: string;
  readonly parentId?: string;
  readonly description?: string;
  readonly ref: Record<string, unknown> & { readonly id: string };
  readonly issueType?: string;
  readonly status?: string;
  readonly statusSince?: string;
  readonly priority?: string;
  readonly assignee?: string;
  readonly estimateHours?: number;
  readonly timeSpentHours?: number;
  readonly labels?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<{
    readonly relation: string;
    readonly direction?: "inward" | "outward";
    readonly key: string;
  }>;
  readonly comments?: ReadonlyArray<{
    readonly author?: string;
    readonly createdAt?: string;
    readonly body?: string;
  }>;
  readonly updatedAt?: string;
};

export type T3workFixtureProjectSource = {
  /** Absolute path of the fixture directory that was loaded. */
  readonly fixtureRoot: string;
  /** Project descriptor from the fixture `metadata.json`, rebound to a fixture account. */
  readonly project: ProjectShellProject;
  readonly externalProjectId: string;
  readonly tickets: ReadonlyArray<T3workFixtureTicket>;
  /** Upper-cased key -> ticket, for relationship resolution. */
  readonly ticketsByKey: ReadonlyMap<string, T3workFixtureTicket>;
  /** Upper-cased parent key -> child keys, derived from `parentId`. */
  readonly childKeysByParentKey: ReadonlyMap<string, ReadonlyArray<string>>;
};

export class T3workFixtureProjectSourceError extends Error {}

function readJsonFile(absolutePath: string): Record<string, unknown> {
  try {
    return JSON.parse(NodeFS.readFileSync(absolutePath, "utf8")) as Record<string, unknown>;
  } catch (cause) {
    throw new T3workFixtureProjectSourceError(
      `Fixture file is missing or not valid JSON: ${absolutePath}`,
      { cause },
    );
  }
}

export function fixtureTicketKey(ticket: T3workFixtureTicket): string {
  const displayId = ticket.ref.displayId;
  return String(typeof displayId === "string" && displayId ? displayId : ticket.id).toUpperCase();
}

function readFixtureTickets(fixtureRoot: string): ReadonlyArray<T3workFixtureTicket> {
  const workItemsDir = NodePath.join(fixtureRoot, "work-items");
  if (!NodeFS.existsSync(workItemsDir)) {
    throw new T3workFixtureProjectSourceError(
      `Fixture has no work-items directory: ${fixtureRoot}`,
    );
  }
  const tickets: T3workFixtureTicket[] = [];
  for (const entry of NodeFS.readdirSync(workItemsDir).toSorted()) {
    if (!entry.endsWith(".json") || entry === "index.json") {
      continue;
    }
    const bundle = readJsonFile(NodePath.join(workItemsDir, entry));
    const ticket = bundle.ticket as T3workFixtureTicket | undefined;
    if (ticket?.ref?.id) {
      tickets.push(ticket);
    }
  }
  if (tickets.length === 0) {
    throw new T3workFixtureProjectSourceError(`Fixture contains no work items: ${fixtureRoot}`);
  }
  return tickets;
}

/**
 * Rebind the fixture project onto a fixture account. The provider kind stays `atlassian`
 * on purpose (see `t3work-fixtureProjectRegistry.ts`); only the account id marks it as
 * fixture-backed, so no Atlassian credential or binding is required anywhere.
 */
function bindFixtureProject(input: {
  readonly raw: Record<string, unknown>;
  readonly accountId: string;
}): ProjectShellProject {
  const project = input.raw as unknown as ProjectShellProject;
  const source = (project.source ?? {}) as Record<string, unknown>;
  const externalProjectId = String(source.externalProjectId ?? project.id);
  return {
    ...project,
    source: {
      ...source,
      provider: "atlassian",
      accountId: input.accountId,
      externalProjectId,
    },
  } as ProjectShellProject;
}

export function loadT3workFixtureProjectSource(input: {
  readonly fixtureRoot: string;
  readonly accountId: string;
}): T3workFixtureProjectSource {
  const fixtureRoot = NodePath.resolve(input.fixtureRoot);
  const metadata = readJsonFile(NodePath.join(fixtureRoot, "metadata.json"));
  const rawProject = metadata.project as Record<string, unknown> | undefined;
  if (!rawProject?.id) {
    throw new T3workFixtureProjectSourceError(
      `Fixture metadata.json has no project descriptor: ${fixtureRoot}`,
    );
  }
  const project = bindFixtureProject({ raw: rawProject, accountId: input.accountId });
  const tickets = readFixtureTickets(fixtureRoot);
  const ticketsByKey = new Map<string, T3workFixtureTicket>();
  const childKeysByParentKey = new Map<string, string[]>();
  for (const ticket of tickets) {
    const key = fixtureTicketKey(ticket);
    ticketsByKey.set(key, ticket);
    ticketsByKey.set(ticket.id.toUpperCase(), ticket);
    const parentKey = ticket.parentId?.toUpperCase();
    if (parentKey) {
      const children = childKeysByParentKey.get(parentKey) ?? [];
      children.push(key);
      childKeysByParentKey.set(parentKey, children);
    }
  }
  return {
    fixtureRoot,
    project,
    externalProjectId: project.source.externalProjectId!,
    tickets,
    ticketsByKey,
    childKeysByParentKey,
  };
}
