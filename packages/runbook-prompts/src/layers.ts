import type { LayerId as AuthoringLayerId } from "@runbook/core/authoring";

/**
 * The four layers of a runbook home (a cascade, not a choice):
 *
 *   1 built-in defaults  ⊂  2 org catalog repo  ⊂  3 project-local override  ⊂  4 instance DB
 *
 * `@runbook/core/authoring`'s `LayerId` only carries the three layers that
 * can ever define runbook LOGIC (`'defaults' | 'catalog' | 'project'`) — it
 * must stay Temporal-workflow-importable, so it deliberately excludes the
 * fourth, config-only layer. This package's prompt cascade needs that wider
 * config-layer union (an `'instance'` layer can hold activation/scheduling/
 * project-binding config), so it is declared here, locally, extending the
 * authoring `LayerId` rather than widening the shared authoring type.
 *
 * `instance` is deliberately NOT part of {@link CASCADE_LAYER_PRECEDENCE}:
 * it must never contribute a prompt body or a slot fill — "DB-stored
 * config is unreviewable — never logic in layer 4". That rule is enforced
 * structurally here (no directory exists for it, so nothing can ever be
 * looked up in it), not left as a comment for callers to remember.
 */
export type ConfigLayerId = AuthoringLayerId | "instance";

/**
 * Precedence, lowest to highest, of the layers that may actually contribute
 * a prompt body or slot fill. `resolvePromptCascade` walks exactly this
 * list — `instance` never appears in it, which is what makes "instance
 * cannot contribute a prompt" true in code rather than by convention.
 */
export const CASCADE_LAYER_PRECEDENCE: readonly AuthoringLayerId[] = [
  "defaults",
  "catalog",
  "project",
];

/**
 * Where each contributing layer's files live for one resolution. The
 * project layer's directory is caller-supplied because it depends on which
 * project a resolution belongs to — this package takes an explicit config
 * object rather than reading environment variables itself, so callers stay
 * free to source it from env, a config file, or anything else.
 */
export interface CascadeConfig {
  /** Layer 1: the built-in prompts tree. Always present. */
  defaultsDir: string;
  /** Layer 2: org catalog repo checkout. Optional. */
  catalogDir?: string;
  /** Layer 3: this project's local override checkout dir. Optional. */
  projectDir?: string;
}

/** Looks up the directory for a given layer, or `undefined` if that layer
 * isn't configured for this resolution. `instance` always returns
 * `undefined` — see the module doc above. */
export function layerDir(config: CascadeConfig, layer: ConfigLayerId): string | undefined {
  switch (layer) {
    case "defaults":
      return config.defaultsDir;
    case "catalog":
      return config.catalogDir;
    case "project":
      return config.projectDir;
    case "instance":
      return undefined;
    default: {
      const exhaustiveCheck: never = layer;
      return exhaustiveCheck;
    }
  }
}
