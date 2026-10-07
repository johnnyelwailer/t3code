/**
 * The explainer's host kit: every primitive it borrows from the app around it. Nothing else in
 * this folder imports from the host (`~/…`, `@t3tools/…`) or its icon set; only react and
 * effect (for the model) are imported directly. When the explainer moves into a pack, this file is the
 * list of what the host's pack UI kit must provide.
 */

// Styling
export { cn } from "~/lib/utils";

// UI primitives
export { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
export { Badge } from "~/components/ui/badge";
export { Button } from "~/components/ui/button";
export { Popover, PopoverPopup } from "~/components/ui/popover";
export { Skeleton } from "~/components/ui/skeleton";
export { Spinner } from "~/components/ui/spinner";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
export { Textarea } from "~/components/ui/textarea";
export { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

// Rich content: the chat's markdown renderer and its sandboxed widget frame
export { default as HostMarkdown } from "~/components/ChatMarkdown";
export { T3TeamWidgetBlock as HostWidgetFrame } from "~/t3team/chat/t3team-widgetBlock";

// Icons (the host's icon set)
export {
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
} from "lucide-react";

// Motion and media
export { useMediaQuery } from "~/hooks/useMediaQuery";
export { observeVisibleAnimation } from "~/lib/visibleAnimation";

// Host types the public props speak in
export type { PullRequestAgentSelectionInput } from "~/components/pullRequest/PullRequestCodeTab";
export type { ScopedThreadRef } from "@t3tools/contracts";
import type { T3TeamMessageWidgetAttachment } from "@t3tools/contracts";

/** A thread widget artifact, as the host's sandboxed frame draws it. */
export type HostWidget = T3TeamMessageWidgetAttachment["widget"];
