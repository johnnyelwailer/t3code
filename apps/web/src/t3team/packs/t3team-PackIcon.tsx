/** `pack-ui` `Icon`: a pack names a glyph and the host draws it from its own icon set. */
import type { PackIconName, PackIconProps } from "@t3team/pack-ui/contract";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleCheckIcon,
  CircleIcon,
  ClockIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  HistoryIcon,
  ImageOffIcon,
  InfoIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  MessageSquarePlusIcon,
  PauseIcon,
  PencilLineIcon,
  PlayIcon,
  RefreshCwIcon,
  ReplyIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

export const PACK_ICONS = {
  check: CheckIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-left": ChevronLeftIcon,
  "chevron-right": ChevronRightIcon,
  "chevron-up": ChevronUpIcon,
  "chevrons-down-up": ChevronsDownUpIcon,
  "chevrons-up-down": ChevronsUpDownIcon,
  circle: CircleIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  code: CodeIcon,
  copy: CopyIcon,
  "external-link": ExternalLinkIcon,
  "flask-conical": FlaskConicalIcon,
  "git-branch": GitBranchIcon,
  history: HistoryIcon,
  "image-off": ImageOffIcon,
  info: InfoIcon,
  lightbulb: LightbulbIcon,
  "message-circle-question": MessageCircleQuestionIcon,
  "message-square-plus": MessageSquarePlusIcon,
  pause: PauseIcon,
  "pencil-line": PencilLineIcon,
  play: PlayIcon,
  "refresh-cw": RefreshCwIcon,
  reply: ReplyIcon,
  "shield-alert": ShieldAlertIcon,
  sparkles: SparklesIcon,
  "triangle-alert": TriangleAlertIcon,
  x: XIcon,
} as const satisfies Record<PackIconName, LucideIcon>;

export function PackIcon({ name, className, "aria-label": label }: PackIconProps) {
  const Glyph = PACK_ICONS[name];
  return label ? (
    <Glyph className={className} role="img" aria-label={label} />
  ) : (
    <Glyph className={className} aria-hidden />
  );
}
