import type { BundledT3WorkProfileId } from "@t3tools/t3work-skill-packs";
import {
  listT3WorkProjectSetupProfiles,
  type T3WorkProjectSetupProfileId,
} from "~/t3work/t3work-projectSetup";

export type T3workProfileCategoryId =
  | "product"
  | "delivery"
  | "engineering"
  | "operations"
  | "security";

export const T3WORK_PROFILE_CATEGORIES: ReadonlyArray<{
  readonly id: T3workProfileCategoryId | "all";
  readonly label: string;
}> = [
  { id: "all", label: "All" },
  { id: "product", label: "Product" },
  { id: "delivery", label: "Delivery" },
  { id: "engineering", label: "Engineering" },
  { id: "operations", label: "Operations" },
  { id: "security", label: "Security" },
];

type T3workProfileFamily = "pink" | "lavender" | "indigo" | "deep" | "orange";

export type T3workProjectSetupCardOption = {
  readonly id: T3WorkProjectSetupProfileId;
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly bullets: readonly string[];
  readonly category: T3workProfileCategoryId;
  readonly family: T3workProfileFamily;
  readonly iconSrc: string;
};

/**
 * Nexi profile illustrations live in `apps/web/public/profiles`, referenced by absolute
 * path (matching the web app's static-asset convention). The category mapping groups the
 * bundled roles under the design's filter tabs; it is presentation-only and can be tuned
 * without touching profile behavior.
 */
const PROFILE_ICON_BASE = "/profiles";

const PROFILE_VISUALS: Record<
  BundledT3WorkProfileId,
  Omit<T3workProjectSetupCardOption, "id" | "title" | "description">
> = {
  "requirements-engineer": {
    badge: "RE",
    bullets: ["Refine requirements", "Check acceptance criteria", "Find unclear tickets"],
    category: "product",
    family: "pink",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_RE.png`,
  },
  "product-owner": {
    badge: "PO / PPO",
    bullets: ["Prioritise backlog", "Split large items", "Draft sprint goals"],
    category: "product",
    family: "pink",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_PO.png`,
  },
  "project-lead": {
    badge: "PL",
    bullets: ["Summarise project status", "Highlight risks", "Prepare stakeholder updates"],
    category: "delivery",
    family: "lavender",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_PL.png`,
  },
  "scrum-master": {
    badge: "SM",
    bullets: ["Find blockers", "Prepare retro input", "Track action items"],
    category: "delivery",
    family: "lavender",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_ScrumMaster.png`,
  },
  developer: {
    badge: "Dev",
    bullets: ["Explain issue context", "Identify blockers", "Draft implementation notes"],
    category: "engineering",
    family: "indigo",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_Dev.png`,
  },
  "test-manager": {
    badge: "Test",
    bullets: ["Plan test scope", "Check coverage gaps", "Summarise defects"],
    category: "engineering",
    family: "indigo",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_Tester-QA.png`,
  },
  "cloud-engineer": {
    badge: "Cloud",
    bullets: ["Track environment tasks", "Identify deployment risks", "Summarise cloud changes"],
    category: "engineering",
    family: "indigo",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_CloudEngineer.png`,
  },
  "system-administrator": {
    badge: "SysAdmin",
    bullets: ["Track access requests", "Summarise system changes", "Flag operational risks"],
    category: "operations",
    family: "deep",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_SystemAdmin.png`,
  },
  "security-engineer": {
    badge: "Security",
    bullets: ["Identify security risks", "Review access topics", "Summarise vulnerabilities"],
    category: "security",
    family: "orange",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_SecurityEngineer.png`,
  },
  "service-manager": {
    badge: "Service",
    bullets: ["Summarise incidents", "Track service risks", "Prepare SLA update"],
    category: "operations",
    family: "deep",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_ServiceManager.png`,
  },
  "steering-member": {
    badge: "Steering",
    bullets: ["Create steering summary", "Surface key decisions", "Explain business impact"],
    category: "delivery",
    family: "lavender",
    iconSrc: `${PROFILE_ICON_BASE}/Nexi_Steering.png`,
  },
};

export function listT3workProjectSetupCardOptions(): ReadonlyArray<T3workProjectSetupCardOption> {
  return listT3WorkProjectSetupProfiles().flatMap((profile) => {
    const visuals = PROFILE_VISUALS[profile.id as BundledT3WorkProfileId];
    if (!visuals) return [];
    return [
      {
        id: profile.id,
        title: profile.title,
        description: profile.description,
        ...visuals,
      },
    ];
  });
}

export function T3workProjectSetupProfileCards({
  selectedProfileId,
  onSelectProfile,
  compact = false,
  options,
}: {
  selectedProfileId: T3WorkProjectSetupProfileId;
  onSelectProfile: (profileId: T3WorkProjectSetupProfileId) => void;
  compact?: boolean;
  options?: ReadonlyArray<T3workProjectSetupCardOption>;
}) {
  const cardOptions = options ?? listT3workProjectSetupCardOptions();

  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: compact
          ? "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))"
          : "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
      }}
    >
      {cardOptions.map((option) => {
        const selected = option.id === selectedProfileId;

        return (
          <button
            key={option.id}
            type="button"
            data-profile-id={option.id}
            data-selected={selected ? "true" : "false"}
            data-nx-family={option.family}
            aria-pressed={selected}
            onClick={() => onSelectProfile(option.id)}
            className="nx-card"
          >
            <div className="nx-card-figure">
              <img
                src={option.iconSrc}
                alt=""
                aria-hidden="true"
                loading="lazy"
                draggable={false}
                className="nx-card-img"
              />
            </div>
            <div className="nx-card-body">
              <span className="nx-badge self-start">{option.badge}</span>
              <h3 className="nx-card-title mt-2">{option.title}</h3>
              <p className="nx-card-desc mt-1.5">{option.description}</p>
              <ul className="nx-bullets mt-3">
                {option.bullets.map((bullet) => (
                  <li key={bullet}>
                    <span className="nx-dot" aria-hidden="true" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </button>
        );
      })}
    </div>
  );
}
