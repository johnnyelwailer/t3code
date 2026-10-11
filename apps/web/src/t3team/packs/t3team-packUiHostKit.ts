/**
 * The host kit as one object, checked against the contract: every name `@t3team/pack-ui`
 * declares, bound to the app's own component, hook or helper. `t3team-packUiImpl.ts` exports it.
 */
import type { PackUiHostKit } from "@t3team/pack-ui/contract";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { cn } from "~/lib/utils";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import { T3TeamWidgetBlock } from "~/t3team/chat/t3team-widgetBlock";

import { PackIcon } from "./t3team-PackIcon";
import { PackMarkdown } from "./t3team-PackMarkdown";
import { usePackDocument, usePackDocuments } from "./t3team-packDocuments";
import { launchRecipe } from "./t3team-packRecipeLaunch";
import { usePackNavigation } from "./t3team-packUiNavigation";

export const hostKit: PackUiHostKit = {
  cn,
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  Button,
  Popover,
  PopoverTrigger,
  PopoverPopup,
  Skeleton,
  Spinner,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Textarea,
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  Markdown: PackMarkdown,
  WidgetFrame: T3TeamWidgetBlock,
  Icon: PackIcon,
  useMediaQuery: (query) => useMediaQuery(query),
  useReducedMotion: () => useMediaQuery("(prefers-reduced-motion: reduce)"),
  observeVisibleAnimation,
  useVisibleAnimation: () => observeVisibleAnimation,
  useNavigation: usePackNavigation,
  usePackDocument,
  usePackDocuments,
  launchRecipe,
};
