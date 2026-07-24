import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import { detectComposerTrigger } from "~/composer-logic";
import {
  buildT3workComposerMenuItems,
  T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS,
  type T3workComposerMenuSources,
} from "~/t3work/composer/t3work-composerMenuItems";

const claudeDriver = ProviderDriverKind.make("claudeAgent");

const providerSlashCommands = [
  { name: "commit", description: "Commit staged changes" },
  { name: "init", input: { hint: "Initialize the repo" } },
];

const skills = [
  { name: "review", path: "skills/review", enabled: true, shortDescription: "Review a diff" },
  { name: "docs", path: "skills/docs", enabled: true, description: "Write docs" },
];

function sources(overrides: Partial<T3workComposerMenuSources> = {}): T3workComposerMenuSources {
  return {
    builtInSlashCommands: T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS,
    provider: claudeDriver,
    providerSlashCommands,
    skills,
    pathEntries: [
      { path: "apps/web/src/main.tsx", kind: "file" as const },
      { path: "apps/web/src", kind: "directory" as const },
    ],
    ...overrides,
  };
}

function triggerFor(text: string) {
  const trigger = detectComposerTrigger(text, text.length);
  if (!trigger) throw new Error(`expected a trigger for ${JSON.stringify(text)}`);
  return trigger;
}

describe("buildT3workComposerMenuItems", () => {
  it("returns no items without a trigger", () => {
    expect(buildT3workComposerMenuItems(null, sources())).toEqual([]);
  });

  it("builds path items with the chat composer's id/label/description shape", () => {
    const items = buildT3workComposerMenuItems(triggerFor("look at @app"), sources());
    expect(items).toEqual([
      {
        id: "path:file:apps/web/src/main.tsx",
        type: "path",
        path: "apps/web/src/main.tsx",
        pathKind: "file",
        label: "main.tsx",
        description: "apps/web/src",
      },
      {
        id: "path:directory:apps/web/src",
        type: "path",
        path: "apps/web/src",
        pathKind: "directory",
        label: "src",
        description: "apps/web",
      },
    ]);
  });

  it("lists built-ins before provider slash commands for the empty query", () => {
    const items = buildT3workComposerMenuItems(triggerFor("/"), sources());
    expect(items.map((item) => item.id)).toEqual([
      "slash:model",
      "slash:plan",
      "slash:default",
      "provider-slash-command:claudeAgent:commit",
      "provider-slash-command:claudeAgent:init",
    ]);
    expect(items[0]).toEqual({
      id: "slash:model",
      type: "slash-command",
      command: "model",
      label: "/model",
      description: "Switch response model for this thread",
    });
  });

  it("falls back to the provider command input hint for the description", () => {
    const items = buildT3workComposerMenuItems(triggerFor("/"), sources());
    const initItem = items.find((item) => item.id === "provider-slash-command:claudeAgent:init");
    expect(initItem?.description).toBe("Initialize the repo");
  });

  it("ranks a typed slash query through the shared slash-command search", () => {
    const items = buildT3workComposerMenuItems(triggerFor("/comm"), sources());
    expect(items.map((item) => item.id)).toEqual(["provider-slash-command:claudeAgent:commit"]);
  });

  it("omits provider slash commands when no provider is selected", () => {
    const items = buildT3workComposerMenuItems(triggerFor("/"), sources({ provider: null }));
    expect(items.map((item) => item.id)).toEqual(["slash:model", "slash:plan", "slash:default"]);
  });

  it("builds skill items with the provider-scoped id and description fallbacks", () => {
    const items = buildT3workComposerMenuItems(triggerFor("$"), sources());
    expect(items.map((item) => item.id)).toEqual([
      "skill:claudeAgent:review",
      "skill:claudeAgent:docs",
    ]);
    expect(items.map((item) => item.description)).toEqual(["Review a diff", "Write docs"]);
  });

  it("returns no skill items when no provider is selected", () => {
    expect(buildT3workComposerMenuItems(triggerFor("$"), sources({ provider: null }))).toEqual([]);
  });

  it("keeps the chat composer's built-in slash command catalog", () => {
    expect(T3WORK_COMPOSER_BUILT_IN_SLASH_COMMANDS.map((builtIn) => builtIn.command)).toEqual([
      "model",
      "plan",
      "default",
    ]);
  });
});
