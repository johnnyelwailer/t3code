// @effect-diagnostics nodeBuiltinImport:off - this cascade does plain
// filesystem I/O (slots-file loading, path containment) by design.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { LayerId } from "@runbook/core/authoring";
import type { ResolvedPrompt } from "@runbook/core/authoring";
import { slotsPathWithin, tryResolvePrompt } from "./registry.js";
import { CASCADE_LAYER_PRECEDENCE, layerDir } from "./layers.js";
import type { CascadeConfig } from "./layers.js";

/**
 * The full result of resolving a prompt id through the cascade — a
 * registry entry (`id · semver · layer · slots · refs`) plus the
 * provenance a run's journal needs to show WHICH layer's prompt actually
 * produced it.
 */
export interface CascadeResolvedPrompt extends ResolvedPrompt {
  /** The layer whose body was used (after slot fills, if any). */
  layer: LayerId;
  /** Absolute path of the body file that was used. */
  path: string;
  /** Layers below `layer` (in cascade precedence) that also defined a full
   * body for this id and were therefore shadowed by it. */
  overriddenLayers: LayerId[];
  /** True iff a layer above `defaults`/`catalog` (i.e. `project`) replaced
   * the whole body of a prompt an earlier layer already defined, rather
   * than filling declared slots — the "off the upgrade path" signal. */
  fullReplacement: boolean;
  /** Slot names (`{{name}}`) still present, literally, in the final body —
   * legitimate for optional slots; reported rather than thrown. */
  unfilledSlots: string[];
  /** Every layer that contributed at least one WINNING slot fill key to the
   * final body (highest-precedence layer wins per key — see the merge in
   * {@link resolvePromptCascade} below). Empty when no layer supplied any
   * slot fill. */
  slotFillLayers: LayerId[];
  /** True iff a layer with HIGHER cascade precedence than `layer` (the
   * layer that owns the winning BODY) contributed a slot fill, or
   * `fullReplacement` is already true — i.e. `layer` alone does not tell
   * the whole story of who shaped the final text. Without this, a
   * resolution could report `layer: 'defaults'`, `fullReplacement: false`,
   * `overriddenLayers: []` while the body was almost entirely authored by
   * a project-layer slot fill, understating project involvement in the
   * journal. */
  materiallyAlteredByHigherLayer: boolean;
}

const SLOT_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Fills `{{slot_name}}` placeholders in `body` from `fills`, leaving any
 * slot with no matching fill literal in place. Returns the filled body plus
 * the deduped list of slot names that had no fill.
 */
export function applySlotFills(
  body: string,
  fills: Record<string, string>,
): { body: string; unfilledSlots: string[] } {
  const unfilled = new Set<string>();
  const filled = body.replace(SLOT_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(fills, name)) {
      return fills[name] as string;
    }
    unfilled.add(name);
    return match;
  });
  return { body: filled, unfilledSlots: [...unfilled] };
}

/**
 * Loads `<id>.slots.json` from `dir` if present, through the same
 * containment guard as prompt bodies. Returns `undefined` for "no slots
 * file here" (unconfigured layer, missing dir, or file absent) — a real
 * problem (traversal attempt, symlink escape, malformed JSON, non-string
 * fill value) still throws.
 */
function tryLoadSlots(id: string, dir: string): Record<string, string> | undefined {
  if (!NodeFS.existsSync(dir)) {
    return undefined;
  }
  const filePath = slotsPathWithin(dir, id);
  if (!NodeFS.existsSync(filePath)) {
    return undefined;
  }
  const rootReal = NodeFS.realpathSync(dir);
  const targetReal = NodeFS.realpathSync(filePath);
  const rel = NodePath.relative(rootReal, targetReal);
  if (rel.startsWith("..") || NodePath.isAbsolute(rel)) {
    throw new Error(
      `prompt cascade: slots file for "${id}" is a symlink leaving its layer directory`,
    );
  }
  const raw = NodeFS.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`prompt cascade: ${filePath} is not valid JSON: ${(err as Error).message}`, {
      cause: err,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `prompt cascade: ${filePath} must be a JSON object of slot name -> fill string`,
    );
  }
  const fills: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`prompt cascade: ${filePath} slot "${key}" fill must be a string`);
    }
    fills[key] = value;
  }
  return fills;
}

/**
 * Resolves a prompt id across the cascade ("a cascade, not a choice" +
 * "overrides as deltas, not copies"):
 *
 *  1. Walk every *configured* layer, low to high precedence, loading a full
 *     `<id>.md` body wherever one exists (each lookup goes through the same
 *     containment guard the plain prompt registry uses, rooted at that
 *     layer's own directory — a project layer can never read outside its
 *     own directory). The highest-precedence hit wins the body.
 *  2. Separately, find the highest-precedence `<id>.slots.json` across the
 *     same configured layers and apply its fills to that winning body.
 *  3. `instance` never participates — it isn't in
 *     {@link CASCADE_LAYER_PRECEDENCE} at all, so it structurally cannot
 *     contribute a body or a slot fill.
 *
 * Throws a clear error listing every directory searched if no configured
 * layer defines the id at all.
 */
export function resolvePromptCascade(id: string, config: CascadeConfig): CascadeResolvedPrompt {
  const searched: string[] = [];
  const layersWithBody: LayerId[] = [];
  let winningLayer: LayerId | undefined;
  let winningLookup: { prompt: ResolvedPrompt; filePath: string } | undefined;

  for (const layer of CASCADE_LAYER_PRECEDENCE) {
    const dir = layerDir(config, layer);
    if (!dir) continue;
    searched.push(`${layer} (${dir})`);
    const found = tryResolvePrompt(id, dir);
    if (found) {
      layersWithBody.push(layer);
      winningLayer = layer;
      winningLookup = found;
    }
  }

  if (!winningLayer || !winningLookup) {
    const where = searched.length > 0 ? searched.join(", ") : "(no cascade layers configured)";
    throw new Error(`prompt cascade: unknown prompt id "${id}" — searched: ${where}`);
  }

  const overriddenLayers = layersWithBody.filter((layer) => layer !== winningLayer);
  // "Off the upgrade path" applies specifically to a project layer forking a
  // body an earlier (defaults/catalog) layer already owned — a catalog
  // layer replacing defaults is the ordinary, PR-reviewed promotion path,
  // not a flagged escape hatch.
  const fullReplacement = winningLayer === "project" && overriddenLayers.length > 0;

  // Slot fills are merged per key, higher precedence winning per key
  // (rather than replacing wholesale per layer) — a higher-precedence
  // layer's `.slots.json` missing a key a lower layer filled must not void
  // that lower layer's fill. Track which layer supplied the surviving
  // value for each key (iterating low-to-high precedence means a later
  // assignment always reflects the correct winner).
  const slotFills: Record<string, string> = {};
  const slotFillSource: Record<string, LayerId> = {};
  for (const layer of CASCADE_LAYER_PRECEDENCE) {
    const dir = layerDir(config, layer);
    if (!dir) continue;
    const fills = tryLoadSlots(id, dir);
    if (!fills) continue;
    for (const [key, value] of Object.entries(fills)) {
      slotFills[key] = value;
      slotFillSource[key] = layer;
    }
  }
  const slotFillLayers = [...new Set(Object.values(slotFillSource))];

  const { body, unfilledSlots } = applySlotFills(winningLookup.prompt.body, slotFills);

  // locBudget must be re-enforced on the FINAL, filled body: enforcing it
  // only on the raw body (before slot fills) would let a higher-precedence
  // layer's `.slots.json` inject unbounded content into a lower layer's
  // prompt while every provenance field kept reporting the pre-fill
  // picture.
  const finalLoc = countNonEmptyLines(body);
  if (finalLoc > winningLookup.prompt.locBudget) {
    const contributors =
      slotFillLayers.length > 0 ? slotFillLayers.join(", ") : "(none — investigate)";
    throw new Error(
      `prompt cascade: "${id}" resolved body is ${finalLoc} LOC after slot fills, over its ` +
        `locBudget of ${winningLookup.prompt.locBudget} (winning body layer: ${winningLayer}; ` +
        `slot fills contributed by: ${contributors})`,
    );
  }

  const winningLayerIndex = CASCADE_LAYER_PRECEDENCE.indexOf(winningLayer);
  // The concealed case this flags: a layer with HIGHER precedence than the
  // one that owns the winning BODY reshaping that body via a slot fill
  // (e.g. `layer: 'defaults'` but `project` supplied the fills) — so the
  // journal can't understate project involvement just because
  // `layer`/`fullReplacement` alone looked clean.
  const materiallyAlteredByHigherLayer =
    fullReplacement ||
    slotFillLayers.some((layer) => CASCADE_LAYER_PRECEDENCE.indexOf(layer) > winningLayerIndex);

  const hash = NodeCrypto.createHash("sha256").update(body, "utf8").digest("hex");

  return {
    id: winningLookup.prompt.id,
    version: winningLookup.prompt.version,
    locBudget: winningLookup.prompt.locBudget,
    hash,
    body,
    layer: winningLayer,
    path: winningLookup.filePath,
    overriddenLayers,
    fullReplacement,
    unfilledSlots,
    slotFillLayers,
    materiallyAlteredByHigherLayer,
  };
}

/** Mirrors registry.ts's `countLoc` (kept as a small local copy rather than
 * importing/exporting across the module boundary — this module's locBudget
 * re-check needs the exact same "non-empty, CR/LF/CRLF-agnostic line count"
 * semantics as the original enforcement point). */
function countNonEmptyLines(body: string): number {
  return body.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0).length;
}
