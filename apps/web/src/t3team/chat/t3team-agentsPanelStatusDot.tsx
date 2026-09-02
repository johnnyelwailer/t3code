/**
 * One Agents-panel sub-run status dot, rendered in the shared GHE #201
 * state-motion language.
 *
 * The DOM mirrors the working-row indicator (T3TeamActiveAgentsIndicator) EXACTLY
 * — a `.t3team-aci-cell` stamped with `data-t3team-state` + `--t3team-aci-i`,
 * wrapping a pulse-wrapper `<span>` that holds the `.t3team-aci-dot` — so the
 * shared motion/hue CSS in t3team-index.css textures each dot the SAME WAY as
 * the working row (no second, divergent style). The PAINT (porcelain-orb
 * palette + 420ms soft-out color shift + sheen) comes from the shared
 * t3team-statusOrb.css module — each dot stamps `t3team-orb`. The panel's
 * `.t3team-agp` scope (set on the panel root by AgentsPanel.tsx) only adds the
 * two still RESULT states' geometry (done/error) — see
 * t3team-agentsPanelDots.css.
 *
 * Each sub-run carries ITS OWN state: live agents animate (working/writing/
 * waiting/thinking, derived from what they're doing), settled agents read a
 * still result (done = green, error = red, stopped/idle = dim). No native
 * `title` tooltip (87325f564) — the accessible name is `aria-label` only; the
 * row's activity line already states what the agent is doing.
 */
import type { CSSProperties } from "react";

import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";

import { cn } from "~/lib/utils";
import "~/t3team/t3team-statusOrb.css";
import { panelDotState } from "./t3team-agentsPanelDots.logic";

import "./t3team-agentsPanelDots.css";

export function AgentsPanelStatusDot({
  agent,
  index = 0,
  ariaLabel,
  className,
}: {
  agent: RuntimeSubagent;
  /** Per-dot hue offset (pass the dot's position in its group). */
  index?: number;
  /** Accessible name (screen readers only — no visible tooltip). */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("t3team-aci-cell inline-flex items-center justify-center", className)}
      data-t3team-state={panelDotState(agent)}
      style={{ "--t3team-aci-i": index } as CSSProperties}
      aria-hidden={ariaLabel === undefined ? true : undefined}
      aria-label={ariaLabel}
    >
      <span className="relative inline-flex">
        <span className="t3team-orb t3team-aci-dot" />
      </span>
    </span>
  );
}
