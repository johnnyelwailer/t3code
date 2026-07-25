import type { RuntimeMode } from "@t3tools/contracts";
import { LockIcon, LockOpenIcon, PenLineIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type RuntimeModeOption = {
  label: string;
  description: string;
  icon: LucideIcon;
};

export type RuntimeModeConfig = Record<RuntimeMode, RuntimeModeOption>;

export const runtimeModeConfig: RuntimeModeConfig = {
  "approval-required": {
    label: "Supervised",
    description: "Ask before commands and file changes.",
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
    icon: PenLineIcon,
  },
  "full-access": {
    label: "Full access",
    description: "Allow commands and edits without prompts.",
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];
