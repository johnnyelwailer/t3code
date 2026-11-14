/**
 * The quick environment filter's pure rules, shared by the web sidebar and the mobile Home list.
 * Callers pass the environments that have something in their list; the module decides whether the
 * control shows at all, which pills it has and in what order, and which selection still holds.
 */
import { heldPillEnvironmentId } from "./t3team-pillScope.ts";

export interface EnvironmentFilterEnvironment {
  readonly id: string;
  readonly label: string;
  /** The environment the client itself runs against; it sorts first. */
  readonly isPrimary?: boolean;
}

export interface EnvironmentFilterPill {
  /** The environment id, or null for "All". */
  readonly id: string | null;
  readonly label: string;
  readonly selected: boolean;
}

export interface EnvironmentFilter {
  /** `null` hides the control: with fewer than two environments there is nothing to choose. */
  readonly pills: ReadonlyArray<EnvironmentFilterPill> | null;
  /** The selection that holds: a selected environment that is gone reads as "All" (`null`). */
  readonly selectedId: string | null;
}

export const ENVIRONMENT_FILTER_ALL_LABEL = "All";

const compareLabels = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

function orderEnvironments(
  environments: ReadonlyArray<EnvironmentFilterEnvironment>,
): ReadonlyArray<EnvironmentFilterEnvironment> {
  const unique = [...new Map(environments.map((env) => [env.id, env] as const)).values()];
  return unique.sort((left, right) => {
    if (Boolean(left.isPrimary) !== Boolean(right.isPrimary)) return left.isPrimary ? -1 : 1;
    return compareLabels(left.label, right.label) || (left.id < right.id ? -1 : 1);
  });
}

/** A blank label falls back to the id; two pills with one label get the id's tail to tell apart. */
function displayLabels(
  environments: ReadonlyArray<EnvironmentFilterEnvironment>,
): ReadonlyArray<string> {
  const labels = environments.map((env) => env.label.trim() || env.id);
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return labels.map((label, index) =>
    (counts.get(label) ?? 0) > 1 ? `${label} (${environments[index]!.id.slice(-4)})` : label,
  );
}

export function resolveEnvironmentFilter(input: {
  readonly environments: ReadonlyArray<EnvironmentFilterEnvironment>;
  readonly selectedId: string | null;
}): EnvironmentFilter {
  const environments = orderEnvironments(input.environments);
  const selectedId = heldPillEnvironmentId(
    input.selectedId,
    new Set(environments.map((env) => env.id)),
  );
  if (environments.length < 2) return { pills: null, selectedId };
  const labels = displayLabels(environments);
  return {
    pills: [
      { id: null, label: ENVIRONMENT_FILTER_ALL_LABEL, selected: selectedId === null },
      ...environments.map((env, index) => ({
        id: env.id,
        label: labels[index]!,
        selected: env.id === selectedId,
      })),
    ],
    selectedId,
  };
}
