import type { FeatureFlagView } from "@t3tools/contracts";

import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { FeatureFlagRow, type FeatureFlagRowProps } from "./t3team-FeatureFlagRow";
import {
  featureFlagGroupSummary,
  withPendingValue,
  type FeatureFlagGroupSection,
} from "./t3team-featureFlagsSettings.logic";

export type FeatureFlagRowState = Omit<FeatureFlagRowProps, "flag" | "busy" | "error"> & {
  readonly pending: ReadonlyMap<string, boolean | null>;
  readonly errors: ReadonlyMap<string, string>;
};

const sectionId = (prefix: string, name: string) =>
  `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function FeatureFlagRows({
  flags,
  state,
}: {
  readonly flags: ReadonlyArray<FeatureFlagView>;
  readonly state: FeatureFlagRowState;
}) {
  const { pending, errors, ...rowProps } = state;
  return flags.map((flag) => (
    <FeatureFlagRow
      key={flag.key}
      {...rowProps}
      flag={withPendingValue(flag, pending.get(flag.key))}
      busy={pending.has(flag.key)}
      error={errors.get(flag.key)}
    />
  ));
}

export function FeatureFlagGroup({
  section,
  state,
}: {
  readonly section: FeatureFlagGroupSection;
  readonly state: FeatureFlagRowState;
}) {
  const id = sectionId("features", section.group);
  return (
    <FoldedSettingsSection
      id={id}
      title={section.group}
      summary={featureFlagGroupSummary(section)}
      defaultOpen
    >
      <FeatureFlagRows flags={section.flags} state={state} />
      {section.subgroups.map((subgroup) => {
        const headingId = sectionId(id, subgroup.name);
        return (
          <div key={subgroup.name} role="group" aria-labelledby={headingId}>
            <h4
              id={headingId}
              className="px-3 pt-3 text-xs font-medium text-muted-foreground sm:px-4"
            >
              {subgroup.name}
            </h4>
            <div className="ms-3 border-s border-border/50 sm:ms-4 [&>*+*]:border-t [&>*+*]:border-border/50">
              <FeatureFlagRows flags={subgroup.flags} state={state} />
            </div>
          </div>
        );
      })}
    </FoldedSettingsSection>
  );
}
