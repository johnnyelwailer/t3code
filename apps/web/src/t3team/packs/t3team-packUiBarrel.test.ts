// @effect-diagnostics nodeBuiltinImport:off - reads the pack-ui package index to compare its declarations.
/**
 * `pack-ui:1` must be a superset of the round-2 explainer host kit: the barrel the explainer
 * player was built against (`apps/web/src/t3team/pr-explainer/t3team-explainerHostKit.ts` on
 * `feature/explainer-player-polish-round-2b-3f27b7a2`, 49f4f9b318). A barrel export with no
 * pack-ui counterpart below is a gap that breaks moving the player into a pack.
 *
 * It also holds the two pack-ui lists together: what the package index declares to packs and
 * what the host implementation exports at runtime.
 */
import * as NodeFS from "node:fs";

import type * as Contract from "@t3team/pack-ui/contract";
import * as ContractValues from "@t3team/pack-ui/contract";
import type {
  ComposerContextRecord,
  ScopedThreadRef,
  T3TeamMessageWidgetAttachment,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { PACK_ICONS } from "./t3team-PackIcon";
import * as packUi from "./t3team-packUiImpl";

const ROUND2_VALUES = [
  "cn",
  "Alert",
  "AlertDescription",
  "AlertTitle",
  "Badge",
  "Button",
  "Popover",
  "PopoverPopup",
  "Skeleton",
  "Spinner",
  "Table",
  "TableBody",
  "TableCell",
  "TableHead",
  "TableHeader",
  "TableRow",
  "Textarea",
  "Tooltip",
  "TooltipPopup",
  "TooltipTrigger",
  "HostMarkdown",
  "HostWidgetFrame",
  "useMediaQuery",
  "observeVisibleAnimation",
  "ChevronDownIcon",
  "ChevronLeftIcon",
  "ChevronRightIcon",
  "ChevronUpIcon",
  "ChevronsDownUpIcon",
  "ChevronsUpDownIcon",
  "CircleCheckIcon",
  "CircleIcon",
  "ClockIcon",
  "CodeIcon",
  "FlaskConicalIcon",
  "GitBranchIcon",
  "HistoryIcon",
  "ImageOffIcon",
  "InfoIcon",
  "LightbulbIcon",
  "MessageCircleQuestionIcon",
  "MessageSquarePlusIcon",
  "PauseIcon",
  "PencilLineIcon",
  "PlayIcon",
  "RefreshCwIcon",
  "ReplyIcon",
  "ShieldAlertIcon",
  "SparklesIcon",
  "TriangleAlertIcon",
  "XIcon",
] as const;

/** Barrel names that pack-ui spells differently. Every other value keeps its name. */
const RENAMED: Readonly<Record<string, string>> = {
  HostMarkdown: "Markdown",
  HostWidgetFrame: "WidgetFrame",
};

/** A lucide export, as the `Icon` name a pack passes: `ChevronsDownUpIcon` → `chevrons-down-up`. */
const iconName = (lucide: string) =>
  lucide
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();

// The barrel's type exports, by their pack-ui name. `PullRequestAgentSelectionInput` (the PR
// panel's add-to-chat shape) becomes the host-neutral context record `composer.addContext` takes.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const ROUND2_TYPES: {
  readonly HostWidget: Same<Contract.PackWidget, T3TeamMessageWidgetAttachment["widget"]>;
  readonly ScopedThreadRef: Same<Contract.ScopedThreadRef, ScopedThreadRef>;
  readonly PullRequestAgentSelectionInput: Same<
    Contract.MessageContextRecord,
    ComposerContextRecord
  >;
} = { HostWidget: true, ScopedThreadRef: true, PullRequestAgentSelectionInput: true };

const runtimeExports = new Set(Object.keys(packUi));

describe("pack-ui v1 against the round-2 host kit", () => {
  it("has a counterpart for every value the round-2 barrel exports", () => {
    const gaps = ROUND2_VALUES.filter((name) =>
      name.endsWith("Icon")
        ? !(iconName(name) in PACK_ICONS)
        : !runtimeExports.has(RENAMED[name] ?? name),
    );

    expect(gaps).toEqual([]);
  });

  it("has a counterpart for every type the round-2 barrel exports", () => {
    expect(Object.values(ROUND2_TYPES).every(Boolean)).toBe(true);
  });
});

describe("pack-ui declarations against the host implementation", () => {
  it("declares to packs exactly the values the host exports", () => {
    const index = NodeFS.readFileSync(
      new URL("../../../../../packages/t3team-pack-ui/src/t3team-packUi.index.ts", import.meta.url),
      "utf8",
    );
    const declared = [...index.matchAll(/^export declare const (\w+)/gm)].map((m) => m[1]);
    const contractValues = new Set(Object.keys(ContractValues));
    const hostValues = [...runtimeExports].filter((name) => !contractValues.has(name));

    expect(declared.toSorted()).toEqual(hostValues.toSorted());
  });
});
