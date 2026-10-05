/**
 * The delegate_task `extensions` options this host registers (see
 * `mcp/t3team-delegatedTaskPreparation.ts`): pure parsing and the effort mapping.
 *
 * - `effort`: provider-agnostic thinking tier (`light` | `standard` | `high`),
 *   mapped through the same seam workflow child turns use (`applyWorkflowEffort`).
 * - `ticketId`: work item the child belongs to; defaults to the parent's ticket.
 * - `environment`: `{ id, label? }` — record the child as bound to another
 *   execution environment (another T3 server). Same-environment ids are no-ops.
 * - `skills`: 1-5 skill names the child should run. FORMAT-validated only — the
 *   host persists the REQUESTED names; the child's driver resolves them pack-side.
 */
import type { AgentEffort } from "@t3team/sdk";
import {
  EnvironmentId,
  type ModelSelection,
  type ServerProvider,
  type ThreadEnvironmentBinding,
} from "@t3tools/contracts";

import * as Effect from "effect/Effect";

import type { DelegatedTaskExtensionOption } from "./mcp/t3team-delegatedTaskPreparation.ts";
import type { ResourcePressureMonitorShape } from "./t3team-resourcePressureMonitor.ts";
import { pressureLine } from "./t3team-resourcePressureToolLine.ts";
import { applyWorkflowEffort, effortIsHonored } from "./t3team-workflowEffortOptions.ts";

export const T3TEAM_DELEGATION_EXTENSIONS: ReadonlyArray<DelegatedTaskExtensionOption> = [
  {
    key: "effort",
    description:
      "'light' | 'standard' | 'high': thinking tier without naming a provider or model; mapped onto the child's reasoning control or tier models. Ignored when target.options is given.",
  },
  {
    key: "ticketId",
    description:
      "Work item (ticket) id the child belongs to; defaults to the current thread's ticket. A different ticket places the child under that ticket.",
  },
  {
    key: "environment",
    description:
      "{ id, label? }: bind the child to another execution environment (T3 server). Messaging and completion wakes stay in this environment.",
  },
  {
    key: "skills",
    description:
      "Array of 1-5 skill names the child should run. A skill name is 1-64 characters of lowercase letters, digits and dashes (e.g. 'deploy-staging'). Names are resolved by the child's skill registry; unknown names fail at session start.",
  },
];

export interface T3TeamDelegationExtensions {
  readonly effort?: AgentEffort;
  readonly ticketId?: string;
  readonly environment?: ThreadEnvironmentBinding;
  /** Requested skill names (format-validated by the host; resolved pack-side). */
  readonly skills?: ReadonlyArray<string>;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

const EFFORTS = new Set<string>(["light", "standard", "high"]);

/** Skill-name charset: lowercase letters, digits, dashes; 1-64 characters. */
const SKILL_NAME = /^[a-z0-9-]{1,64}$/;
const MAX_SKILLS = 5;

const SKILL_NAME_SHAPE =
  "a skill name is 1-64 characters of lowercase letters, digits and dashes (e.g. 'deploy-staging')";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimmedString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

function parseEnvironmentExtension(
  value: unknown,
): ParseResult<ThreadEnvironmentBinding | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  const id = isRecord(value) ? trimmedString(value.id) : undefined;
  if (!isRecord(value) || id === undefined) {
    return {
      ok: false,
      message:
        "extensions.environment must be { id: <environment id>, label?: string }. Omit it to keep the child in this environment.",
    };
  }
  const label = trimmedString(value.label);
  const environmentId = EnvironmentId.make(id);
  return { ok: true, value: label === undefined ? { environmentId } : { environmentId, label } };
}

/** `skills`: 1-5 skill names, format-checked against the skill-name charset only — the child's driver resolves them pack-side. */
export function parseSkillsExtension(
  value: unknown,
): ParseResult<ReadonlyArray<string> | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      message:
        "extensions.skills must be a non-empty array of up to " +
        `${MAX_SKILLS} skill names; ${SKILL_NAME_SHAPE}.`,
    };
  }
  if (value.length === 0) {
    return {
      ok: false,
      message: `extensions.skills must name at least one skill; ${SKILL_NAME_SHAPE}.`,
    };
  }
  if (value.length > MAX_SKILLS) {
    return {
      ok: false,
      message: `extensions.skills accepts at most ${MAX_SKILLS} skills (got ${value.length}).`,
    };
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || !SKILL_NAME.test(entry)) {
      return {
        ok: false,
        message: `extensions.skills contains an invalid skill name ${
          typeof entry === "string" ? JSON.stringify(entry) : String(entry)
        }; ${SKILL_NAME_SHAPE}.`,
      };
    }
  }
  return { ok: true, value: value as ReadonlyArray<string> };
}

export function parseDelegationExtensions(
  raw: Readonly<Record<string, unknown>> | undefined,
): ParseResult<T3TeamDelegationExtensions> {
  if (raw === undefined) return { ok: true, value: {} };
  const effort = raw.effort;
  if (effort !== undefined && (typeof effort !== "string" || !EFFORTS.has(effort.trim()))) {
    return {
      ok: false,
      message:
        "extensions.effort must be 'light', 'standard' or 'high' (provider-agnostic; put provider values in target.options).",
    };
  }
  if (raw.ticketId !== undefined && trimmedString(raw.ticketId) === undefined) {
    return { ok: false, message: "extensions.ticketId must be a non-empty string." };
  }
  const environment = parseEnvironmentExtension(raw.environment);
  if (!environment.ok) return environment;
  const skills = parseSkillsExtension(raw.skills);
  if (!skills.ok) return skills;
  const ticketId = trimmedString(raw.ticketId);
  return {
    ok: true,
    value: {
      ...(typeof effort === "string" ? { effort: effort.trim() as AgentEffort } : {}),
      ...(ticketId === undefined ? {} : { ticketId }),
      ...(environment.value === undefined ? {} : { environment: environment.value }),
      ...(skills.value === undefined ? {} : { skills: skills.value }),
    },
  };
}

/** Applies `effort` unless explicit target options win; notes an effort that cannot land. */
export function applyDelegationEffort(input: {
  readonly modelSelection: ModelSelection;
  readonly effort: AgentEffort | undefined;
  readonly explicitTargetOptions: boolean;
  readonly providers: ReadonlyArray<ServerProvider>;
}): { readonly modelSelection: ModelSelection; readonly note?: string } {
  const { effort, modelSelection, providers } = input;
  if (effort === undefined) return { modelSelection };
  if (input.explicitTargetOptions) {
    return {
      modelSelection,
      note: `effort '${effort}' was ignored: target.options were given explicitly.`,
    };
  }
  const applied = applyWorkflowEffort(modelSelection, effort, providers);
  return effortIsHonored(applied, effort, providers)
    ? { modelSelection: applied }
    : {
        modelSelection: applied,
        note:
          `effort '${effort}' was not honored: provider '${applied.instanceId}' exposes no ` +
          `reasoning control and no tier models; the child runs on model '${applied.model}'.`,
      };
}

/** Same-environment bindings are no-ops; anything else is recorded with its delivery boundary. */
export function resolveEnvironmentBinding(
  environment: ThreadEnvironmentBinding | undefined,
  localEnvironmentId: string,
): { readonly binding?: ThreadEnvironmentBinding; readonly note?: string } {
  if (environment === undefined || environment.environmentId === localEnvironmentId) return {};
  return {
    binding: environment,
    note:
      `Child is bound to environment '${environment.label ?? environment.environmentId}' (another ` +
      "T3 server). Messaging and completion wakes only reach threads in THIS environment; " +
      "report-back from that child needs a separate channel.",
  };
}

/** A spawn adds load: with the pressure feature on, the result carries the host's pressure line. */
export const delegationPressureNotes = (
  monitor: ResourcePressureMonitorShape | undefined,
): Effect.Effect<ReadonlyArray<string>> =>
  monitor?.autoPause === undefined
    ? Effect.succeed([])
    : monitor.report.pipe(
        Effect.map((report) => (report.snapshot === null ? [] : [pressureLine(report.snapshot)])),
      );
