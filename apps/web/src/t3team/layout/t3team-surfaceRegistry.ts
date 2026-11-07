/**
 * The fork's right-panel surface registry: `t3team`-namespace entries in upstream's tab
 * vocabulary, each mapped to a serializable `{ kind, id, params }`. Hot files call into
 * the entries only.
 */
import {
  T3_TEAM_MY_WORK_PANEL_ID,
  T3_TEAM_MY_WORK_PANEL_KIND,
  t3TeamMyWorkPanelParams,
} from "./t3team-surfacePanels";
import {
  T3_TEAM_PULL_REQUEST_VIEW_KIND,
  t3TeamPrViewIdOf,
  t3TeamPrViewParams,
  type T3TeamPrViewParams,
} from "./t3team-surfacePrView";

/** The serializable params of a fork surface: a JSON-safe record. */
export type T3TeamForkSurfaceParams = Readonly<Record<string, unknown>>;

/** One registered fork surface in its serializable form. */
export interface T3TeamForkSurface {
  /** The `t3team`-namespace kind, e.g. `t3team.my-work`. */
  readonly kind: string;
  /** The stable surface id: derived from the params, never free-form. */
  readonly id: string;
  readonly params: T3TeamForkSurfaceParams;
}

/** A surface-kind entry: owns the id and the params schema. */
export interface T3TeamSurfaceEntry {
  readonly kind: string;
  /** The upstream tab kind the surface maps onto. */
  readonly tabKind: "pull-requests" | "surface";
  readonly idOf: (params: T3TeamForkSurfaceParams) => string;
  readonly parseParams: (raw: unknown) => T3TeamForkSurfaceParams | null;
}

export const T3_TEAM_MY_WORK_PANEL: T3TeamSurfaceEntry = {
  kind: T3_TEAM_MY_WORK_PANEL_KIND,
  tabKind: "pull-requests",
  idOf: () => T3_TEAM_MY_WORK_PANEL_ID,
  parseParams: t3TeamMyWorkPanelParams,
};

export const T3_TEAM_PULL_REQUEST_VIEW: T3TeamSurfaceEntry = {
  kind: T3_TEAM_PULL_REQUEST_VIEW_KIND,
  tabKind: "surface",
  idOf: (params) => t3TeamPrViewIdOf(params as T3TeamPrViewParams),
  parseParams: t3TeamPrViewParams,
};

/** Every registered surface-kind entry. */
export const T3_TEAM_SURFACE_ENTRIES: readonly T3TeamSurfaceEntry[] = [
  T3_TEAM_MY_WORK_PANEL,
  T3_TEAM_PULL_REQUEST_VIEW,
];

/** The entry registered under a `t3team` kind; null for unknown kinds. */
export function findT3TeamSurfaceByKind(kind: string): T3TeamSurfaceEntry | null {
  return T3_TEAM_SURFACE_ENTRIES.find((entry) => entry.kind === kind) ?? null;
}

/**
 * Parses a persisted `{ kind, id, params }` into a registered surface: null for an
 * unknown kind, params that fail the entry's schema, or an id that disagrees with the
 * params.
 */
export function parseT3TeamForkSurface(raw: unknown): T3TeamForkSurface | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const entry = typeof record.kind === "string" ? findT3TeamSurfaceByKind(record.kind) : null;
  if (entry === null) return null;
  const params = entry.parseParams(record.params);
  if (params === null) return null;
  const id = entry.idOf(params);
  if (typeof record.id === "string" && record.id !== id) return null;
  return { kind: entry.kind, id, params };
}

/**
 * Serializes a registered surface to its JSON-safe `{ kind, id, params }` form. Throws for
 * an unregistered kind or params the entry rejects: a surface that cannot serialize is a
 * registration bug, not a user-facing state.
 */
export function serializeT3TeamForkSurface(surface: T3TeamForkSurface): T3TeamForkSurface {
  const entry = findT3TeamSurfaceByKind(surface.kind);
  if (entry === null) throw new Error(`Unregistered t3team surface kind: ${surface.kind}`);
  const params = entry.parseParams(surface.params);
  if (params === null) throw new Error(`Malformed params for t3team surface kind: ${surface.kind}`);
  return { kind: entry.kind, id: entry.idOf(params), params: { ...params } };
}

/** The round trip: serialize, then parse back; null when the surface does not parse. */
export function roundTripT3TeamForkSurface(surface: T3TeamForkSurface): T3TeamForkSurface | null {
  return parseT3TeamForkSurface(JSON.parse(JSON.stringify(serializeT3TeamForkSurface(surface))));
}

export {
  isT3TeamSessionScopedPanelKey,
  MY_WORK_PANEL_REF,
  T3_TEAM_MY_WORK_PANEL_ID,
  T3_TEAM_MY_WORK_PANEL_KIND,
  t3TeamMyWorkPanelParams,
} from "./t3team-surfacePanels";
export {
  parsePullRequestSurfaceView,
  pullRequestSurfaceViewEqual,
  serializePullRequestSurfaceView,
  T3_TEAM_PULL_REQUEST_VIEW_KIND,
  t3TeamPrViewIdOf,
  t3TeamPrViewParams,
  type PullRequestSurfaceView,
  type T3TeamPrViewParams,
} from "./t3team-surfacePrView";
export {
  t3TeamIsRetiredRightPanelKind,
  T3_TEAM_RETiredRightPanelKinds,
  T3_TEAM_THREAD_SURFACE_KIND,
} from "./t3team-surfaceRetired";
