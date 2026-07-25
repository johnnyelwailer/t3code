import type { ReactNode } from "react";

import type { AdfNode, PanelType, StatusColor, TaskState } from "@t3tools/integrations-atlassian";

/** The ADF model is owned by `packages/integrations-atlassian/src/adf` — never redeclared here. */
export type { AdfNode, PanelType, StatusColor, TaskState };

/**
 * The shared model types marks as loose records (`Array<Record<string, unknown>>`), so mark
 * readers narrow attrs at the access point instead of trusting a shape.
 */
export type AdfMark = Readonly<Record<string, unknown>>;

export type AdfDocument = AdfNode & { readonly version?: number | undefined };

/** Rendering services threaded through the tree as a plain object (no context provider). */
export type AdfRenderContext = {
  /** Rewrites a Jira asset URL to a locally cached one. See `createJiraTicketAssetUrlResolver`. */
  readonly resolveAssetUrl?: ((url: string) => string) | undefined;
  /** Keeps Jira issue navigation in-app instead of opening a browser tab. */
  readonly onOpenIssue?: ((issueKey: string) => void) | undefined;
};

export type AdfNodeProps = {
  readonly node: AdfNode;
  readonly ctx: AdfRenderContext;
  readonly depth: number;
};

export type AdfNodeComponent = (props: AdfNodeProps) => ReactNode;

export type AdfNodeRenderers = Readonly<Record<string, AdfNodeComponent>>;

/**
 * Recursion guard. Real Jira documents nest a handful of levels; anything deeper is
 * either pathological or hostile, and is flattened to plain text instead of recursed into.
 */
export const ADF_MAX_RENDER_DEPTH = 24;

export function isAdfNode(value: unknown): value is AdfNode {
  return typeof value === "object" && value !== null && typeof (value as AdfNode).type === "string";
}

export function adfChildren(node: AdfNode): readonly AdfNode[] {
  return Array.isArray(node.content) ? node.content.filter(isAdfNode) : [];
}

export function adfAttrString(node: AdfNode, key: string): string | undefined {
  const value = node.attrs?.[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function adfAttrNumber(node: AdfNode, key: string): number | undefined {
  const value = node.attrs?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function adfAttrBoolean(node: AdfNode, key: string): boolean {
  return node.attrs?.[key] === true;
}

/** Reads the block content of a `doc` node, tolerating malformed payloads. */
export function readAdfDocumentContent(doc: unknown): readonly AdfNode[] {
  if (!isAdfNode(doc)) return [];
  return adfChildren(doc);
}
