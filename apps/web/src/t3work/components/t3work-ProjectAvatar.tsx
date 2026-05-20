import { useEffect, useMemo, useState } from "react";
import { buildAtlassianAssetContentUrl } from "~/t3work/t3work-atlassianAssetUrls";

const ICON_RETRY_BACKOFF_MS = [15_000, 45_000, 120_000, 300_000] as const;
const JIRA_PROJECT_AVATAR_PATH_PREFIX = "/rest/api/3/universal_avatar/view/type/project/avatar/";

function readObjectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function readProjectAvatarUrl(raw: unknown): string | undefined {
  const record = readObjectRecord(raw);
  return (
    readOptionalString(record.avatarDataUrl) ??
    readOptionalString(record.avatarUrl) ??
    readOptionalString(record.iconUrl)
  );
}

function readProjectAvatarAccountId(raw: unknown): string | undefined {
  const siteUrl = readOptionalString(readObjectRecord(raw).siteUrl);
  if (!siteUrl) {
    return undefined;
  }

  const trimmedSiteUrl = siteUrl.replace(/\/+$/, "");
  if (!trimmedSiteUrl) {
    return undefined;
  }

  try {
    const url = new URL(trimmedSiteUrl);
    if (url.hostname === "api.atlassian.com") {
      const match = /^\/ex\/jira\/([^/]+)\/?$/.exec(url.pathname);
      return match?.[1] ?? trimmedSiteUrl;
    }
  } catch {
    return trimmedSiteUrl;
  }

  return trimmedSiteUrl;
}

export function buildProjectAvatarProxyUrl(input: {
  raw?: unknown;
  iconUrl?: string | undefined;
}): string | undefined {
  const sourceUrl = input.iconUrl ?? readProjectAvatarUrl(input.raw);
  if (!sourceUrl || sourceUrl.startsWith("data:")) {
    return undefined;
  }

  const accountId = readProjectAvatarAccountId(input.raw);
  if (!accountId) {
    return undefined;
  }

  try {
    const url = new URL(sourceUrl);
    if (!url.pathname.includes(JIRA_PROJECT_AVATAR_PATH_PREFIX)) {
      return undefined;
    }
    return buildAtlassianAssetContentUrl({ accountId, url: url.toString() });
  } catch {
    return undefined;
  }
}

export function ProjectAvatar({
  title,
  projectKey,
  raw,
  iconUrl,
  className,
}: {
  title: string;
  projectKey?: string | undefined;
  raw?: unknown;
  iconUrl?: string | undefined;
  className?: string | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const color = (readObjectRecord(raw).avatarColor as string | undefined) ?? "#1868db";
  const directIconUrl = iconUrl ?? readProjectAvatarUrl(raw);
  const proxyIconUrl = useMemo(
    () => buildProjectAvatarProxyUrl({ raw, iconUrl: directIconUrl }),
    [directIconUrl, raw],
  );
  const resolvedIconUrl = useProxyFallback ? (proxyIconUrl ?? directIconUrl) : directIconUrl;
  const shouldRetry = Boolean(resolvedIconUrl) && !resolvedIconUrl?.startsWith("data:");
  const iconSrc = useMemo(() => {
    if (!resolvedIconUrl || retryAttempt === 0 || !shouldRetry) {
      return resolvedIconUrl;
    }
    return `${resolvedIconUrl}${resolvedIconUrl.includes("?") ? "&" : "?"}t3-icon-retry=${retryAttempt}`;
  }, [resolvedIconUrl, retryAttempt, shouldRetry]);
  const shortKey = (projectKey ?? title).slice(0, 2).toUpperCase();
  const defaultClassName = "size-6 shrink-0 rounded-md";
  const resolvedClassName = className ?? defaultClassName;
  const fallbackClassName = useMemo(
    () => `flex items-center justify-center ${resolvedClassName}`,
    [resolvedClassName],
  );

  useEffect(() => {
    setImageFailed(false);
    setRetryAttempt(0);
    setUseProxyFallback(false);
  }, [directIconUrl, proxyIconUrl]);

  useEffect(() => {
    if (!resolvedIconUrl || !imageFailed || !shouldRetry) {
      return;
    }
    const backoffIndex = Math.min(retryAttempt, ICON_RETRY_BACKOFF_MS.length - 1);
    const timeoutId = window.setTimeout(() => {
      setRetryAttempt((current) => current + 1);
      setImageFailed(false);
    }, ICON_RETRY_BACKOFF_MS[backoffIndex]);
    return () => window.clearTimeout(timeoutId);
  }, [imageFailed, resolvedIconUrl, retryAttempt, shouldRetry]);

  if (resolvedIconUrl && !imageFailed) {
    return (
      <img
        src={iconSrc}
        alt={`${title} icon`}
        className={`${resolvedClassName} object-cover`}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (!useProxyFallback && proxyIconUrl && proxyIconUrl !== directIconUrl) {
            setUseProxyFallback(true);
            return;
          }
          setImageFailed(true);
        }}
      />
    );
  }

  return (
    <div className={fallbackClassName} style={{ background: color }} aria-hidden="true">
      <span className="text-[10px] font-semibold text-white">{shortKey}</span>
    </div>
  );
}
