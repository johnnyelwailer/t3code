/**
 * `pack-ui:1` host primitives: the props a pack passes to the host's own design-system parts.
 *
 * They own their look: pick a variant and size; layout belongs on the parent element. Only the
 * parts with no parent to lay them out (table cells, skeleton boxes, icons) take a `className`,
 * and it is for layout and size, never colour or type. Variant and size names are contract.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  Ref,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import type { ScopedThreadRef, T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

/** The host's attributes minus its styling hooks: a primitive's look is its variant. */
type Unstyled<T> = Omit<T, "className" | "style">;

export type PackButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "ghost-muted"
  | "destructive";
export type PackButtonSize = "default" | "sm" | "xs" | "micro" | "icon-sm" | "icon-micro";
export interface PackButtonProps extends Unstyled<ButtonHTMLAttributes<HTMLButtonElement>> {
  readonly variant?: PackButtonVariant;
  readonly size?: PackButtonSize;
}

export type PackBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "info"
  | "success"
  | "warning"
  | "error";
export interface PackBadgeProps extends Unstyled<HTMLAttributes<HTMLSpanElement>> {
  readonly variant?: PackBadgeVariant;
  readonly size?: "default" | "sm";
}

export interface PackSkeletonProps {
  /** Width and height only: a skeleton's size is its content's. */
  readonly className?: string;
  readonly shape?: "block" | "card" | "pill";
}

export type PackAlertVariant = "default" | "info" | "success" | "warning" | "error";
export interface PackAlertProps extends Unstyled<HTMLAttributes<HTMLDivElement>> {
  readonly variant?: PackAlertVariant;
}
/** `AlertTitle` and `AlertDescription`. */
export type PackAlertPartProps = Unstyled<HTMLAttributes<HTMLDivElement>>;

/** No size inside a `Button`: the button sizes its glyph. */
export interface PackSpinnerProps {
  readonly size?: "xs" | "sm" | "md" | "lg";
  readonly tone?: "current" | "muted";
  readonly "aria-label"?: string;
}

export interface PackTextareaProps extends Unstyled<TextareaHTMLAttributes<HTMLTextAreaElement>> {
  readonly size?: "sm" | "compact" | "default" | "lg";
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/** Table parts. `className` is for layout (width, alignment, wrapping) only. */
export type PackTableProps = HTMLAttributes<HTMLTableElement>;
export type PackTableSectionProps = HTMLAttributes<HTMLTableSectionElement>;
export type PackTableRowProps = HTMLAttributes<HTMLTableRowElement>;
export type PackTableHeadProps = ThHTMLAttributes<HTMLTableCellElement>;
export type PackTableCellProps = TdHTMLAttributes<HTMLTableCellElement>;

/** An mdast node, as a remark plugin sees it. */
export interface PackMarkdownNode {
  type: string;
}
type PackMarkdownTransform = {
  // Bivariant, as React types its event handlers: a plugin may name its own node shape.
  bivarianceHack(tree: PackMarkdownNode): void;
}["bivarianceHack"];
/** A remark plugin: `() => (tree) => void`. It runs before the host's link and image policy. */
export type PackRemarkPlugin = () => PackMarkdownTransform;

/**
 * Chat markdown (GFM). Raw HTML is shown as text, never parsed. Links keep only `http(s):`,
 * `mailto:` and `#fragment` targets; any other link renders as its text. An image renders only
 * from an inline `data:image/…;base64` source, so text never makes the reader fetch a URL;
 * otherwise its alt text shows.
 */
export interface PackMarkdownProps {
  readonly text: string;
  readonly size?: "default" | "compact";
  /** Keep the array stable (module scope or memoised): a new one re-parses the text. */
  readonly remarkPlugins?: ReadonlyArray<PackRemarkPlugin>;
}

/** A thread widget artifact (`showWidget` html/svg), as the host's sandboxed frame draws it. */
export type PackWidget = T3TeamMessageWidgetAttachment["widget"];
/**
 * The chat's sandboxed widget iframe. It follows the app's light/dark theme on its own. A widget
 * that calls tools needs the `threadRef` it belongs to; `null` draws it without them.
 */
export interface PackWidgetFrameProps {
  readonly widget: PackWidget;
  readonly threadRef: ScopedThreadRef | null;
}
