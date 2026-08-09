import type { AdfNode, StatusColor, TaskState } from "./types.ts";

/** Inline status lozenge. Colors per the ADF schema: neutral/purple/blue/red/yellow/green. */
export function status(text: string, color: StatusColor): AdfNode {
  return { type: "status", attrs: { text, color } };
}

/** A single task item; must live inside a `taskList`. */
export function taskItem(localId: string, state: TaskState, content: AdfNode[]): AdfNode {
  return { type: "taskItem", attrs: { localId, state }, content };
}

/** A checkable task list. `items` are `taskItem(...)` nodes. */
export function taskList(localId: string, items: AdfNode[]): AdfNode {
  return { type: "taskList", attrs: { localId }, content: items };
}

/** An inline smart-link card resolved from a bare URL (never combine with `data`). */
export function inlineCard(url: string): AdfNode {
  return { type: "inlineCard", attrs: { url } };
}

/** A date lozenge; `timestamp` is the epoch-milliseconds string. */
export function date(timestamp: string): AdfNode {
  return { type: "date", attrs: { timestamp } };
}

/** A user mention by Atlassian accountId; triggers a notification when rendered. */
export function mention(accountId: string, text?: string): AdfNode {
  const attrs: Record<string, unknown> = { id: accountId };
  if (text !== undefined) attrs.text = text;
  return { type: "mention", attrs };
}

/** A code block; content is one or more mark-free text nodes. Empty text is dropped, not an empty node. */
export function codeBlock(text: string, language?: string): AdfNode {
  const attrs: Record<string, unknown> | undefined = language ? { language } : undefined;
  const content = text === "" ? [] : [{ type: "text", text }];
  const node: AdfNode = { type: "codeBlock", content };
  if (attrs) node.attrs = attrs;
  return node;
}

const PANEL_FORBIDDEN = new Set(["codeBlock", "table", "panel"]);

/**
 * Wraps ADF block content in a Jira panel. Panels may only contain
 * paragraph/heading/bulletList/orderedList — codeBlock/table/nested panel
 * throw.
 */
export function panel(
  panelType: "info" | "note" | "warning" | "error" | "success",
  content: AdfNode[],
): AdfNode {
  for (const node of content) {
    if (PANEL_FORBIDDEN.has(node.type)) {
      throw new TypeError(
        `panel() cannot contain a ${node.type} node — only paragraph/heading/lists are allowed`,
      );
    }
  }
  return { type: "panel", attrs: { panelType }, content };
}

/** Wraps ADF block content in a collapsible expand. Expand cannot contain expand. */
export function expand(title: string, content: AdfNode[]): AdfNode {
  for (const node of content) {
    if (node.type === "expand") {
      throw new TypeError(
        "expand() cannot contain a nested expand — use nestedExpand inside table cells instead",
      );
    }
  }
  return { type: "expand", attrs: { title }, content };
}

const NESTED_EXPAND_ALLOWED = new Set(["paragraph", "heading", "mediaGroup", "mediaSingle"]);

/**
 * A collapsible expand valid only inside `tableCell`/`tableHeader` content
 * (the caller is responsible for placement). Content restricted to
 * paragraph/heading/media per the ADF schema.
 */
export function nestedExpand(title: string, content: AdfNode[]): AdfNode {
  for (const node of content) {
    if (!NESTED_EXPAND_ALLOWED.has(node.type)) {
      throw new TypeError(
        `nestedExpand() content must be paragraph/heading/media, got: ${node.type}`,
      );
    }
  }
  return { type: "nestedExpand", attrs: { title }, content };
}

/** `<hr/>` — no attrs, no content. */
export function rule(): AdfNode {
  return { type: "rule" };
}
