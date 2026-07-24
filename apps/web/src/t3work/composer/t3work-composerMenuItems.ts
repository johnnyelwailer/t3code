import type {
  ProjectEntry,
  ProviderDriverKind,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "@t3tools/contracts";

import type { ComposerSlashCommand, ComposerTrigger } from "~/composer-logic";
import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import { searchSlashCommandItems } from "~/components/chat/composerSlashCommandSearch";
import { basenameOfPath } from "~/pierre-icons";
import { formatProviderSkillDisplayName } from "~/providerSkillPresentation";
import { searchProviderSkills } from "~/providerSkillSearch";

export type T3workComposerBuiltInSlashCommand = {
  readonly command: ComposerSlashCommand;
  readonly description: string;
};

export type T3workComposerPathEntry = {
  readonly path: string;
  readonly kind: ProjectEntry["kind"];
};

/**
 * The chat composer's hardcoded built-in slash commands, in the same order and
 * with the same descriptions. Surfaces that cannot honour a command (e.g. the
 * kickoff composer has no thread-scoped model picker) pass a subset.
 */
export const T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS: ReadonlyArray<T3workComposerBuiltInSlashCommand> =
  [
    { command: "model", description: "Switch response model for this thread" },
    { command: "plan", description: "Switch this thread into plan mode" },
    { command: "default", description: "Switch this thread back to normal build mode" },
  ];

export type T3workComposerMenuSources = {
  readonly builtInSlashCommands: ReadonlyArray<T3workComposerBuiltInSlashCommand>;
  readonly provider: ProviderDriverKind | null;
  readonly providerSlashCommands: ReadonlyArray<ServerProviderSlashCommand>;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly pathEntries: ReadonlyArray<T3workComposerPathEntry>;
};

function buildPathItems(
  entries: ReadonlyArray<T3workComposerPathEntry>,
): ComposerCommandItem[] {
  return entries.map((entry) => ({
    id: `path:${entry.kind}:${entry.path}`,
    type: "path" as const,
    path: entry.path,
    pathKind: entry.kind,
    label: basenameOfPath(entry.path),
    description: entry.path.slice(0, Math.max(0, entry.path.lastIndexOf("/"))),
  }));
}

function buildSlashCommandItems(
  sources: T3workComposerMenuSources,
  query: string,
): ComposerCommandItem[] {
  const provider = sources.provider;
  const builtInItems = sources.builtInSlashCommands.map((builtIn) => ({
    id: `slash:${builtIn.command}`,
    type: "slash-command" as const,
    command: builtIn.command,
    label: `/${builtIn.command}`,
    description: builtIn.description,
  }));
  const providerItems = provider
    ? sources.providerSlashCommands.map((command) => ({
        id: `provider-slash-command:${provider}:${command.name}`,
        type: "provider-slash-command" as const,
        provider,
        command,
        label: `/${command.name}`,
        description: command.description ?? command.input?.hint ?? "Run provider command",
      }))
    : [];
  const slashCommandItems = [...builtInItems, ...providerItems];
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return slashCommandItems;
  }
  return searchSlashCommandItems(slashCommandItems, normalizedQuery);
}

function buildSkillItems(
  sources: T3workComposerMenuSources,
  query: string,
): ComposerCommandItem[] {
  const provider = sources.provider;
  if (!provider) {
    return [];
  }
  return searchProviderSkills(sources.skills, query).map((skill) => ({
    id: `skill:${provider}:${skill.name}`,
    type: "skill" as const,
    provider,
    skill,
    label: formatProviderSkillDisplayName(skill),
    description:
      skill.shortDescription ??
      skill.description ??
      (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
  }));
}

/**
 * Builds the composer command menu items for a detected trigger.
 *
 * Mirrors the chat composer's inline item construction (ChatComposer.tsx
 * `composerMenuItems`) so every composer surface produces the same `/`, `@`
 * and `$` entries. ChatComposer itself is an upstream file the additive guard
 * forbids modifying, so this module is the shared home for new surfaces and
 * for the t3work-owned item kinds layered on top.
 */
export function buildT3workComposerMenuItems(
  trigger: ComposerTrigger | null,
  sources: T3workComposerMenuSources,
): ComposerCommandItem[] {
  if (!trigger) {
    return [];
  }
  if (trigger.kind === "path") {
    return buildPathItems(sources.pathEntries);
  }
  if (trigger.kind === "slash-command") {
    return buildSlashCommandItems(sources, trigger.query);
  }
  if (trigger.kind === "skill") {
    return buildSkillItems(sources, trigger.query);
  }
  return [];
}
