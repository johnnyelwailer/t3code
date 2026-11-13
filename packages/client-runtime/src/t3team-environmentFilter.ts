/**
 * The quick environment filter's pure rules, shared by the web sidebar and the mobile Home list.
 * Callers pass the environments that have something in their list; the module decides whether the
 * control shows at all, which pills it has and in what order, and which selection still holds.
 */

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
  /** `null` hides the control: with fewer than two visible environments and nothing hidden. */
  readonly pills: ReadonlyArray<EnvironmentFilterPill> | null;
  /** The environments the reader hid, so a control can offer them back; empty when none. */
  readonly hiddenPills: ReadonlyArray<EnvironmentFilterPill>;
  /** The selection that holds: a selected environment that is gone or hidden reads as "All". */
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
  /** Ids the reader hid: their pills leave `pills` and join `hiddenPills`, where they can be brought back. */
  readonly hiddenIds?: ReadonlySet<string> | readonly string[];
}): EnvironmentFilter {
  const environments = orderEnvironments(input.environments);
  const hidden = new Set<string>(input.hiddenIds ?? []);
  const visible = environments.filter((env) => !hidden.has(env.id));
  const hiddenEnvs = environments.filter((env) => hidden.has(env.id));
  const selectedId =
    input.selectedId !== null &&
    !hidden.has(input.selectedId) &&
    environments.some((env) => env.id === input.selectedId)
      ? input.selectedId
      : null;
  const labels = displayLabels(environments);
  const labelById = new Map(environments.map((env, index) => [env.id, labels[index]!] as const));
  const hiddenPills = hiddenEnvs.map((env) => ({
    id: env.id,
    label: labelById.get(env.id)!,
    selected: false,
  }));
  if (visible.length < 2 && hiddenPills.length === 0) {
    return { pills: null, hiddenPills, selectedId: null };
  }
  return {
    pills: [
      { id: null, label: ENVIRONMENT_FILTER_ALL_LABEL, selected: selectedId === null },
      ...visible.map((env) => ({
        id: env.id,
        label: labelById.get(env.id)!,
        selected: env.id === selectedId,
      })),
    ],
    hiddenPills,
    selectedId,
  };
}
