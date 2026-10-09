/**
 * `pack-ui:1` host-rendered slots other than `message.view`: the Summary tab of a change request,
 * the change-request affordance in a My Work row, a My Work dashboard widget, and a sidecar
 * section.
 *
 * Unlike `message.view`, none of these takes data from a thread artifact: the host renders the
 * slot and supplies the props, so a registration carries no props schema. A slot that renders
 * several registrations does so in registration order (host first, then packs in activation order),
 * each in its own error boundary.
 */
import type { ChangeRequestState } from "@t3tools/contracts";
import type { ComponentType } from "react";

import type { ChangeRequestRef } from "./t3team-packUi.navigation.ts";

/** What a `changeRequest.summary` component receives: the change request the panel shows. */
export interface ChangeRequestSummaryProps {
  readonly changeRequest: ChangeRequestRef & {
    /** Where the host reports them with the detail; absent otherwise. */
    readonly headSha?: string;
    readonly baseSha?: string;
    readonly state: ChangeRequestState;
    /** The viewer is the author. `false` too where the host could not say who the viewer is. */
    readonly viewerAuthored: boolean;
  };
}

/**
 * A card at the top of the change request panel's Summary tab, between its meta rows and the
 * description. Render nothing when there is nothing to say: an empty slot takes no room.
 */
export interface ChangeRequestSummaryRegistration {
  readonly slot: "changeRequest.summary";
  /** `<packId>.<name>`. */
  readonly id: string;
  readonly component: ComponentType<ChangeRequestSummaryProps>;
}

/** What a `myWork.changeRequest` component receives. */
export interface MyWorkChangeRequestProps {
  readonly changeRequest: ChangeRequestRef;
  /** `chip` beside a ticket's pull request chip; `row` beside a review row's actions. */
  readonly density: "row" | "chip";
}

/**
 * A compact affordance beside one change request in the My Work digest. It sits next to the
 * host's own chip or row, never inside its link, so it may hold buttons of its own. Keep it small:
 * it repeats for every change request listed.
 */
export interface MyWorkChangeRequestRegistration {
  readonly slot: "myWork.changeRequest";
  readonly id: string;
  readonly component: ComponentType<MyWorkChangeRequestProps>;
}

/** What a `dashboard.widget` component receives: the section it was placed for, and where. */
export interface DashboardWidgetViewProps {
  readonly placement: "side" | "main" | "footer";
  readonly section: {
    readonly id: string;
    readonly heading: string;
    readonly hint?: string;
    /** Ticket ids the arrangement placed in the section; the widget reads them from the host. */
    readonly items: ReadonlyArray<{ readonly ticketId: string; readonly why?: string }>;
  };
}

/**
 * The widget's definition, as an arrangement places it by `id`. Plain data: a pack never ships
 * a component name, because the registration pairs the definition with its component. A
 * definition the host cannot decode refuses the whole pack's activation.
 */
export interface DashboardWidgetViewDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly shortDescription?: string;
  /** Recipe surfaces, e.g. `project.dashboard.myWork`. */
  readonly surfaces: ReadonlyArray<string>;
  /** Which refs the placed widget lists; `none` for one that reads the host's data itself. */
  readonly content: "tickets" | "reviews" | "none";
  readonly placements: ReadonlyArray<"side" | "main" | "footer">;
}

export interface DashboardWidgetRegistration {
  readonly slot: "dashboard.widget";
  /** Equals `definition.id`. */
  readonly id: string;
  readonly definition: DashboardWidgetViewDefinition;
  readonly component: ComponentType<DashboardWidgetViewProps>;
}

/** The part of the host a sidecar section may use. */
export interface SidecarSectionViewHost {
  readonly surface: string;
  readonly projectId: string;
  readonly launchRecipe: (recipeId: string, parameters?: Record<string, unknown>) => void;
  readonly openThread: (threadId: string) => void;
}

/** What a `sidecar.section` component receives. `props` come from the surface that mounts it. */
export interface SidecarSectionViewProps {
  readonly host: SidecarSectionViewHost;
  readonly props?: unknown;
}

export interface SidecarSectionViewDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly shortDescription?: string;
  readonly surfaces: ReadonlyArray<string>;
  readonly allowedToolGroups?: ReadonlyArray<string>;
  readonly defaults?: { readonly collapsed?: boolean; readonly visible?: boolean };
}

/**
 * A section in the sidecar of the surfaces its definition lists. It shows only where a profile
 * or project composition names its `id`, like a bundled section.
 */
export interface SidecarSectionRegistration {
  readonly slot: "sidecar.section";
  /** Equals `definition.id`. */
  readonly id: string;
  readonly definition: SidecarSectionViewDefinition;
  readonly component: ComponentType<SidecarSectionViewProps>;
}
