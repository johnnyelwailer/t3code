/**
 * Auto-latest model routing: map a requested model slug to the newest version the target
 * provider's LIVE catalog reports, before an agent session is created.
 *
 * Host-neutral and pure — no I/O, no clock, no provider internals. The caller hands in the slug
 * list its provider instance advertises (`ServerProvider.models[].slug` on the T3 server), so a
 * provider that ships a new model needs no code change here: routing only ever picks a slug that
 * is already in the catalog, and never invents one.
 *
 * A slug is read as `[namespace/]base-<tokens>`: numeric tokens (`5`, `5.6`) form the version
 * tuple, alphabetic tokens form the tier, and a trailing 8-digit token is a snapshot date that
 * only breaks ties. `gpt-5.6-sol` → `{ base: "gpt", version: [5, 6], tier: "sol" }`;
 * `claude-opus-4-5` and `claude-3-5-opus` both → `{ base: "claude", version: [4|3, 5], tier: "opus" }`.
 * Anything else (no version, digit-led tokens like `4o`, a split version run, stray characters)
 * is unparseable and passes through unchanged.
 */

export interface ParsedModelSlug {
  /** Family key: namespace prefix (up to the last `/`) plus the leading name token, lowercased. */
  readonly base: string;
  readonly version: ReadonlyArray<number>;
  /** Non-numeric tokens after the base, joined with `-`; `""` for a base-tier slug (`gpt-5.4`). */
  readonly tier: string;
  /** Trailing `YYYYMMDD` snapshot stamp, when present. */
  readonly date?: number;
}

export type ModelRoutingReason =
  | "flag-off"
  | "unparseable"
  | "no-catalog-family"
  | "already-latest"
  | "same-tier-newer"
  | "tier-absent-provider-latest";

export interface ModelRouting {
  readonly requested: string;
  /** The slug to run: the catalog's slug when routed, otherwise `requested` verbatim. */
  readonly effective: string;
  readonly routed: boolean;
  readonly reason: ModelRoutingReason;
}

const BASE_TOKEN = /^[a-z]+(?:\.[a-z]+)*$/;
const VERSION_TOKEN = /^\d+(?:\.\d+)*$/;
const DATE_TOKEN = /^\d{8}$/;
const TIER_TOKEN = /^[a-z][a-z0-9]*$/;

export function parseModelSlug(slug: string): ParsedModelSlug | undefined {
  const lowered = slug.trim().toLowerCase();
  const slash = lowered.lastIndexOf("/");
  const namespace = lowered.slice(0, slash + 1);
  const tokens = lowered.slice(slash + 1).split("-");
  const [head, ...rest] = tokens;
  if (head === undefined || !BASE_TOKEN.test(head)) return undefined;

  const last = rest.at(-1);
  const date = last !== undefined && DATE_TOKEN.test(last) ? Number(last) : undefined;
  const body = date === undefined ? rest : rest.slice(0, -1);

  const version: number[] = [];
  const tier: string[] = [];
  let versionRunClosed = false;
  for (const token of body) {
    if (VERSION_TOKEN.test(token)) {
      // One contiguous version run only: `gemini-2.0-flash-001` is ambiguous, not a version.
      if (versionRunClosed) return undefined;
      version.push(...token.split(".").map(Number));
    } else if (TIER_TOKEN.test(token)) {
      if (version.length > 0) versionRunClosed = true;
      tier.push(token);
    } else {
      return undefined;
    }
  }
  if (version.length === 0) return undefined;
  return {
    base: `${namespace}${head}`,
    version,
    tier: tier.join("-"),
    ...(date === undefined ? {} : { date }),
  };
}

/** Lexicographic tuple order, missing components read as 0 (`[6]` equals `[6, 0]`). */
export function compareModelVersions(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface CatalogEntry {
  readonly slug: string;
  readonly parsed: ParsedModelSlug;
}

/** Newest entry by version, then snapshot date; equal entries keep catalog order (first wins). */
const newest = (entries: ReadonlyArray<CatalogEntry>): CatalogEntry | undefined =>
  entries.reduce<CatalogEntry | undefined>((best, entry) => {
    if (best === undefined) return entry;
    const byVersion = compareModelVersions(entry.parsed.version, best.parsed.version);
    if (byVersion !== 0) return byVersion > 0 ? entry : best;
    return (entry.parsed.date ?? 0) > (best.parsed.date ?? 0) ? entry : best;
  }, undefined);

/**
 * Route `requestedModel` against `providerCatalog` (the target provider's slug list).
 *
 * - Same tier at a newer version in the catalog → that slug (`gpt-5.6-sol` → `gpt-6-sol`).
 * - Tier absent from the catalog → the family's newest slug, any tier.
 * - Already newest in its tier (or newer than the catalog) → unchanged, `routed: false`.
 * - Flag off, unparseable slug, or no catalog entry of the same family → unchanged.
 */
export function resolveModelRouting(
  requestedModel: string,
  providerCatalog: ReadonlyArray<string>,
  options: { readonly flagOn: boolean },
): ModelRouting {
  const keep = (reason: ModelRoutingReason): ModelRouting => ({
    requested: requestedModel,
    effective: requestedModel,
    routed: false,
    reason,
  });
  if (!options.flagOn) return keep("flag-off");
  const requested = parseModelSlug(requestedModel);
  if (requested === undefined) return keep("unparseable");

  const family = providerCatalog.flatMap((slug): CatalogEntry[] => {
    const parsed = parseModelSlug(slug);
    return parsed?.base === requested.base ? [{ slug, parsed }] : [];
  });
  if (family.length === 0) return keep("no-catalog-family");

  const sameTier = family.filter((entry) => entry.parsed.tier === requested.tier);
  const target = newest(sameTier.length > 0 ? sameTier : family);
  if (
    target === undefined ||
    (sameTier.length > 0 && compareModelVersions(target.parsed.version, requested.version) <= 0)
  ) {
    return keep("already-latest");
  }
  return {
    requested: requestedModel,
    effective: target.slug,
    routed: true,
    reason: sameTier.length > 0 ? "same-tier-newer" : "tier-absent-provider-latest",
  };
}
