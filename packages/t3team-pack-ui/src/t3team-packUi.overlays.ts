/**
 * `pack-ui:1` overlays: the host's popover and tooltip. A trigger takes the pack's own element as
 * `render` and lends it the open/close behaviour; the popup is the host's surface.
 */
import type { ReactElement, ReactNode, RefObject } from "react";

export type PackSide = "top" | "bottom" | "left" | "right";
export type PackAlign = "start" | "center" | "end";

/** What a popup points at: an element, a ref to one, or a rect (a text selection's). */
export type PackAnchor =
  | Element
  | RefObject<Element | null>
  | { getBoundingClientRect(): DOMRect; readonly contextElement?: Element }
  | null;

/** Where focus goes: `true` the default, `false` nowhere, or a specific element. */
export type PackFocusTarget =
  | boolean
  | RefObject<HTMLElement | null>
  | (() => HTMLElement | boolean | null);

export interface PackOverlayTriggerProps {
  /** The pack's own element (usually a `button`); omitted, the host renders a plain button. */
  readonly render?: ReactElement;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
}

export interface PackPopoverProps {
  readonly children?: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  /** `details.event` is what closed it (an outside press, Escape), where there is one. */
  readonly onOpenChange?: (open: boolean, details: { readonly event?: Event }) => void;
}

export interface PackPopoverPopupProps {
  readonly children?: ReactNode;
  readonly side?: PackSide;
  readonly align?: PackAlign;
  readonly sideOffset?: number;
  readonly padding?: "default" | "compact" | "none";
  /** Defaults to the trigger. */
  readonly anchor?: PackAnchor;
  readonly initialFocus?: PackFocusTarget;
  readonly finalFocus?: PackFocusTarget;
  readonly "aria-label"?: string;
}

export interface PackTooltipProps {
  readonly children?: ReactNode;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface PackTooltipPopupProps {
  readonly children?: ReactNode;
  readonly side?: PackSide;
  readonly align?: PackAlign;
  readonly sideOffset?: number;
}
