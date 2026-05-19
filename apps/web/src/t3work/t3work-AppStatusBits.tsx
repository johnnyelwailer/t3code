import { Loader2, Wifi, WifiOff } from "lucide-react";
import type { ProjectShellProject } from "@t3tools/project-context";
import { Badge } from "~/t3work/components/ui/t3work-badge";
import { useBackendState } from "~/t3work/backend/t3work-index";
import { ProjectAvatar } from "~/t3work/components/t3work-ProjectAvatar";

export function ConnectionStatusBadge() {
  const backendState = useBackendState();

  if (backendState.connectionStatus === "connected") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Wifi className="size-3 text-emerald-500" />
        <span className="hidden sm:inline">Connected</span>
      </Badge>
    );
  }

  if (backendState.connectionStatus === "connecting") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Loader2 className="size-3 animate-spin text-amber-500" />
        <span className="hidden sm:inline">Connecting</span>
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <WifiOff className="size-3 text-muted-foreground" />
      <span className="hidden sm:inline">Disconnected</span>
    </Badge>
  );
}

export function ProviderBadges() {
  const backendState = useBackendState();
  const readyProviders = backendState.providers.filter((p) => p.status === "ready" && p.enabled);

  if (readyProviders.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {readyProviders.slice(0, 2).map((provider) => (
        <Badge
          key={provider.instanceId}
          variant="secondary"
          className="hidden text-[10px] sm:inline-flex"
        >
          {provider.displayName ?? provider.instanceId}
        </Badge>
      ))}
      {readyProviders.length > 2 && (
        <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
          +{readyProviders.length - 2}
        </Badge>
      )}
    </div>
  );
}

export function AppProjectIcon({ project }: { project: ProjectShellProject }) {
  return (
    <ProjectAvatar
      title={project.title}
      projectKey={project.source.externalProjectKey}
      raw={project.source.raw}
    />
  );
}
