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

const NEW_FOR_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FeatureFlagFreshness {
  readonly isNew: boolean;
  /** "Since Oct 2026", or "Established" for a switch older than the registry. */
  readonly label: string;
}

const ESTABLISHED: FeatureFlagFreshness = { isNew: false, label: "Established" };

/** No `addedOn` means the switch predates the registry (2026-10-23), which wrapped what shipped. */
export function featureFlagFreshness(
  flag: Pick<FeatureFlagView, "addedOn">,
  now: Date,
): FeatureFlagFreshness {
  if (flag.addedOn === undefined) return ESTABLISHED;
  const added = new Date(`${flag.addedOn}T00:00:00Z`);
  if (Number.isNaN(added.getTime())) return ESTABLISHED;
  const month = added.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    isNew: now.getTime() - added.getTime() <= NEW_FOR_DAYS * DAY_MS,
    label: `Since ${month}`,
  };
}

function sectionFlags(section: FeatureFlagGroupSection): ReadonlyArray<FeatureFlagView> {
  return [...section.flags, ...section.subgroups.flatMap((subgroup) => subgroup.flags)];
}

export function featureFlagGroupSummary(section: FeatureFlagGroupSection, now: Date): string {
  const newCount = sectionFlags(section).filter(
    (flag) => featureFlagFreshness(flag, now).isNew,
  ).length;
  const onCount = `${section.enabledCount} of ${section.totalCount} on`;
  return newCount === 0 ? onCount : `${onCount} · ${newCount} new`;
}
