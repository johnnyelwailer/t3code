import type { FeatureFlagView, FeatureFlagsView } from "@t3tools/contracts";

export interface FeatureFlagSubgroupSection {
  readonly name: string;
  readonly flags: ReadonlyArray<FeatureFlagView>;
}

export interface FeatureFlagGroupSection {
  readonly group: string;
  /** Flags directly in the group, before any subgroup. */
  readonly flags: ReadonlyArray<FeatureFlagView>;
  readonly subgroups: ReadonlyArray<FeatureFlagSubgroupSection>;
  readonly enabledCount: number;
  readonly totalCount: number;
}

const unique = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> => [...new Set(values)];

/**
 * Sections in `view.groups` order, then any group only a pack flag names (packs register at
 * runtime, so the server's order cannot know them). Empty groups are skipped; flags keep the
 * registry order inside their group and subgroup.
 */
export function groupFeatureFlags(
  view: Pick<FeatureFlagsView, "groups" | "flags">,
): ReadonlyArray<FeatureFlagGroupSection> {
  const groups = unique([...view.groups, ...view.flags.map((flag) => flag.group)]);
  return groups.flatMap((group) => {
    const members = view.flags.filter((flag) => flag.group === group);
    if (members.length === 0) return [];
    const subgroupNames = unique(
      members.flatMap((flag) => (flag.subgroup === undefined ? [] : [flag.subgroup])),
    );
    return [
      {
        group,
        flags: members.filter((flag) => flag.subgroup === undefined),
        subgroups: subgroupNames.map((name) => ({
          name,
          flags: members.filter((flag) => flag.subgroup === name),
        })),
        enabledCount: members.filter((flag) => flag.enabled).length,
        totalCount: members.length,
      },
    ];
  });
}

export type FeatureFlagChipVariant = "info" | "success" | "secondary" | "outline";

export interface FeatureFlagSourceChip {
  readonly label: string;
  readonly variant: FeatureFlagChipVariant;
}

export function featureFlagSourceChip(
  flag: Pick<FeatureFlagView, "source" | "envName">,
  preset: string | undefined,
): FeatureFlagSourceChip {
  switch (flag.source) {
    case "env":
      return { label: `Set by ${flag.envName}`, variant: "info" };
    case "user":
      return { label: "Your choice", variant: "success" };
    case "preset":
      return {
        label: preset === undefined ? "Release preset" : `Release preset · ${preset}`,
        variant: "secondary",
      };
    case "default":
      return { label: "Default", variant: "outline" };
  }
}

/** Why the switch cannot be flipped here, phrased as what would change it; null when it can. */
export function featureFlagLockReason(
  flag: Pick<FeatureFlagView, "source" | "envName" | "userToggleable">,
  canEdit: boolean,
): string | null {
  if (flag.source === "env") return `Unset ${flag.envName} and restart to choose here.`;
  if (!flag.userToggleable) return "Only the release preset or an env override decides this one.";
  if (!canEdit) return "This connection lacks permission to change settings.";
  return null;
}

/** `pending` is the value a request is sending: a boolean shows at once, `null` (reset) waits
 * for the server, which alone knows the preset or default it falls back to. */
export function withPendingValue(
  flag: FeatureFlagView,
  pending: boolean | null | undefined,
): FeatureFlagView {
  return typeof pending === "boolean" ? { ...flag, enabled: pending } : flag;
}

export function featureFlagGroupSummary(section: FeatureFlagGroupSection): string {
  return `${section.enabledCount} of ${section.totalCount} on`;
}
