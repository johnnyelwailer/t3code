export interface AdfNode {
  type: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<Record<string, unknown>>;
  text?: string;
}

export type PanelType = "info" | "note" | "warning" | "error" | "success";
export type StatusColor = "neutral" | "purple" | "blue" | "red" | "yellow" | "green";
export type TaskState = "TODO" | "DONE";

const HEX_6 = /^#[0-9a-fA-F]{6}$/;

/** Validates a 6-digit hex color (`#rrggbb`) per the ADF mark/attr schema. */
export function assertHex6(color: string, label: string): void {
  if (!HEX_6.test(color)) {
    throw new TypeError(`${label} must be a 6-digit hex color (#rrggbb), got: ${color}`);
  }
}
