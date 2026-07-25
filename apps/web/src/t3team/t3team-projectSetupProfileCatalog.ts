import {
  Bug,
  ClipboardCheck,
  Code2,
  MessageCircleMore,
  PackageCheck,
  Server,
  ShieldCheck,
  Sparkles,
  UserCog,
  type LucideIcon,
} from "lucide-react";

import type { EnvironmentSetupProfile } from "@t3tools/contracts";
import type { BundledT3TeamProfileId } from "@t3tools/t3team-skill-packs";
import {
  listT3TeamProjectSetupProfiles,
  type T3TeamProjectSetupProfileId,
} from "~/t3team/t3team-projectSetup";

export type T3TeamProjectSetupCardOption = {
  readonly id: T3TeamProjectSetupProfileId;
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly chips: readonly string[];
  readonly icon: LucideIcon;
  /** Pack-provided illustration; when set it renders instead of the Lucide icon. */
  readonly iconSrc?: string;
  readonly accentClassName: string;
  readonly iconClassName: string;
};

type Visual = Pick<T3TeamProjectSetupCardOption, "icon" | "accentClassName" | "iconClassName">;

const CATEGORY_VISUALS: Record<EnvironmentSetupProfile["category"], Visual> = {
  product: {
    icon: Sparkles,
    accentClassName: "from-sky-500/16 via-cyan-400/14 to-transparent",
    iconClassName: "text-sky-600 dark:text-sky-300",
  },
  delivery: {
    icon: PackageCheck,
    accentClassName: "from-cyan-500/16 via-teal-400/14 to-transparent",
    iconClassName: "text-cyan-600 dark:text-cyan-300",
  },
  engineering: {
    icon: Code2,
    accentClassName: "from-violet-500/16 via-indigo-400/14 to-transparent",
    iconClassName: "text-violet-600 dark:text-violet-300",
  },
  operations: {
    icon: Server,
    accentClassName: "from-amber-500/16 via-orange-400/14 to-transparent",
    iconClassName: "text-amber-600 dark:text-amber-300",
  },
  security: {
    icon: ShieldCheck,
    accentClassName: "from-rose-500/16 via-red-400/14 to-transparent",
    iconClassName: "text-rose-600 dark:text-rose-300",
  },
};

const BUILT_IN_VISUALS: Record<
  BundledT3TeamProfileId,
  Omit<T3TeamProjectSetupCardOption, "id" | "title" | "description">
> = {
  "qa-assistant": { eyebrow: "Verify", chips: ["Test matrices", "Repro steps"], ...CATEGORY_VISUALS.product, icon: Bug },
  "product-partner": { eyebrow: "Friendly", chips: ["Plain language", "Fast summaries"], ...CATEGORY_VISUALS.product },
  "support-triage": { eyebrow: "Triage", chips: ["Escalations", "Customer impact"], ...CATEGORY_VISUALS.operations, icon: MessageCircleMore },
  "delivery-coordinator": { eyebrow: "Coordinate", chips: ["Status", "Dependencies"], ...CATEGORY_VISUALS.delivery },
  "verification-guide": { eyebrow: "Guide", chips: ["Checklists", "Release cues"], ...CATEGORY_VISUALS.engineering, icon: ClipboardCheck },
  "engineering-copilot": { eyebrow: "Build", chips: ["Technical depth", "Verification bias"], ...CATEGORY_VISUALS.engineering, icon: UserCog },
};

function fromPackProfile(profile: EnvironmentSetupProfile): T3TeamProjectSetupCardOption {
  const visual = CATEGORY_VISUALS[profile.category];
  return {
    id: profile.id,
    title: profile.title,
    description: profile.description,
    eyebrow: profile.badge,
    chips: profile.bullets.slice(0, 3),
    icon: visual.icon,
    ...(profile.iconDataUrl ? { iconSrc: profile.iconDataUrl } : {}),
    accentClassName: visual.accentClassName,
    iconClassName: visual.iconClassName,
  };
}

/**
 * Card options for the setup wizard. When a workspace pack contributes setup
 * profiles they take over the catalog; otherwise the built-in generic roles show.
 */
export function listT3TeamProjectSetupCardOptions(
  packProfiles?: readonly EnvironmentSetupProfile[],
): ReadonlyArray<T3TeamProjectSetupCardOption> {
  if (packProfiles && packProfiles.length > 0) {
    return packProfiles.map(fromPackProfile);
  }
  return listT3TeamProjectSetupProfiles().flatMap((profile) => {
    const visuals = BUILT_IN_VISUALS[profile.id as BundledT3TeamProfileId];
    if (!visuals) return [];
    return [{ id: profile.id, title: profile.title, description: profile.description, ...visuals }];
  });
}
