/**
 * Everything `@t3team/pack-ui` exports at runtime, as the host must implement it. The package
 * index declares exactly these names, and the host implementation is checked against this type,
 * so a name added here is one the host cannot forget.
 */
import type { ComponentType } from "react";

import type { PackDoc, PackDocumentState } from "./t3team-packUi.contract.ts";
import type { PackIconProps } from "./t3team-packUi.icons.ts";
import type { PackNavigation } from "./t3team-packUi.navigation.ts";
import type {
  PackOverlayTriggerProps,
  PackPopoverPopupProps,
  PackPopoverProps,
  PackTooltipPopupProps,
  PackTooltipProps,
} from "./t3team-packUi.overlays.ts";
import type {
  PackAlertPartProps,
  PackAlertProps,
  PackBadgeProps,
  PackButtonProps,
  PackMarkdownProps,
  PackSkeletonProps,
  PackSpinnerProps,
  PackTableCellProps,
  PackTableHeadProps,
  PackTableProps,
  PackTableRowProps,
  PackTableSectionProps,
  PackTextareaProps,
  PackWidgetFrameProps,
} from "./t3team-packUi.primitives.ts";

/** clsx's input: strings, falsy values to skip, arrays, and `{ class: condition }` objects. */
export type PackClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | PackClassValue[]
  | { readonly [className: string]: unknown };

/** Input to pack-ui's `launchRecipe` (S5b): start a discovered recipe's workflow headlessly,
 * with no thread — one surface button press becomes one run. */
export interface PackRecipeLaunchInput {
  /** The recipe to run: an id from this project's recipe library (pack or project-local). */
  readonly recipeId: string;
  /** One of that recipe's named actions; absent (or `"default"`) runs `defaultAction`. */
  readonly action?: string;
  /** The workflow's args, as the recipe's `Inputs` shape. */
  readonly args?: Record<string, unknown>;
  /** Where the launch was called from; the host resolves the project from it (no thread). */
  readonly surfaceContext?: Record<string, unknown>;
}

/** The result of a headless recipe launch. */
export interface PackRecipeLaunchResult {
  /** The headless run's id (the `workflow_runs` record). */
  readonly runId: string;
  /** The run's status as admitted by the engine. */
  readonly status: string;
}

export interface PackUiHostKit {
  // Styling: joins classes for a pack's own elements, resolving Tailwind conflicts.
  readonly cn: (...inputs: PackClassValue[]) => string;

  // Primitives
  readonly Alert: ComponentType<PackAlertProps>;
  readonly AlertTitle: ComponentType<PackAlertPartProps>;
  readonly AlertDescription: ComponentType<PackAlertPartProps>;
  readonly Badge: ComponentType<PackBadgeProps>;
  readonly Button: ComponentType<PackButtonProps>;
  readonly Popover: ComponentType<PackPopoverProps>;
  readonly PopoverTrigger: ComponentType<PackOverlayTriggerProps>;
  readonly PopoverPopup: ComponentType<PackPopoverPopupProps>;
  readonly Skeleton: ComponentType<PackSkeletonProps>;
  readonly Spinner: ComponentType<PackSpinnerProps>;
  readonly Table: ComponentType<PackTableProps>;
  readonly TableHeader: ComponentType<PackTableSectionProps>;
  readonly TableBody: ComponentType<PackTableSectionProps>;
  readonly TableRow: ComponentType<PackTableRowProps>;
  readonly TableHead: ComponentType<PackTableHeadProps>;
  readonly TableCell: ComponentType<PackTableCellProps>;
  readonly Textarea: ComponentType<PackTextareaProps>;
  readonly Tooltip: ComponentType<PackTooltipProps>;
  readonly TooltipTrigger: ComponentType<PackOverlayTriggerProps>;
  readonly TooltipPopup: ComponentType<PackTooltipPopupProps>;

  // Content
  readonly Markdown: ComponentType<PackMarkdownProps>;
  readonly WidgetFrame: ComponentType<PackWidgetFrameProps>;
  readonly Icon: ComponentType<PackIconProps>;

  // Motion and media
  /** A CSS media query, live. */
  readonly useMediaQuery: (query: string) => boolean;
  readonly useReducedMotion: () => boolean;
  /**
   * Ref callback for a stable animation container: it sets `--visible-animation-state` to
   * `running` only while the element is on screen, the tab is visible and motion is allowed.
   * Use `animation-play-state: var(--visible-animation-state)` in the pack's CSS.
   */
  readonly observeVisibleAnimation: (
    element: HTMLElement | SVGElement | null,
  ) => void | (() => void);
  /** `observeVisibleAnimation`, as a hook for components that prefer one. */
  readonly useVisibleAnimation: () => (
    element: HTMLElement | SVGElement | null,
  ) => void | (() => void);

  // Navigation
  readonly useNavigation: () => PackNavigation;

  // Data (the pack's own store)
  /** Live document `key` of the calling pack's `collection`; `null` when it does not exist. */
  readonly usePackDocument: (collection: string, key: string) => PackDocumentState<PackDoc | null>;
  /** Live documents of the calling pack's `collection`, optionally under a key prefix. */
  readonly usePackDocuments: (
    collection: string,
    options?: { readonly prefix?: string },
  ) => PackDocumentState<ReadonlyArray<PackDoc>>;

  // Headless launch (S5b): start a recipe's workflow with no thread. The host resolves the
  // project from `surfaceContext` and the recipe through the project's unfiltered library.
  readonly launchRecipe: (input: PackRecipeLaunchInput) => Promise<PackRecipeLaunchResult>;
}
