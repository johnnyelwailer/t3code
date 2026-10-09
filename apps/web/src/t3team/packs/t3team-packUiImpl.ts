/**
 * The host's implementation of `@t3team/pack-ui`. The web build resolves that specifier here (the
 * distribution web plugin for pack files, `tsconfig` paths inside this app), so a pack gets the
 * app's own primitives — one copy of each — and nothing else of the app.
 *
 * Every export is typed as the contract types it, not as the host component it is: pack code in
 * this app is checked against exactly what a pack outside it sees.
 *
 * Imports the contract by its `/contract` subpath: importing `@t3team/pack-ui` here would resolve
 * back to this file.
 */
import { hostKit } from "./t3team-packUiHostKit";

export * from "@t3team/pack-ui/contract";

export const {
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
  Markdown,
  WidgetFrame,
  Icon,
  useMediaQuery,
  useReducedMotion,
  observeVisibleAnimation,
  useVisibleAnimation,
  useNavigation,
  usePackDocument,
  usePackDocuments,
} = hostKit;
