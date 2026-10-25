import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

const mobile = NodePath.resolve(import.meta.dirname, "../..");
const root = NodePath.join(mobile, "src");

function walk(directory: string, accept: (file: string) => boolean): string[] {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "build", "ios"].includes(entry.name) ? [] : walk(path, accept);
    }
    return accept(path) ? [path] : [];
  });
}

const read = (file: string) => NodeFS.readFileSync(file, "utf8");
const rel = (base: string, file: string) => NodePath.relative(base, file);
const sourceFiles = () =>
  walk(root, (file) => /\.(ts|tsx)$/.test(file) && !/\.(test|stories|browser)\./.test(file));

/**
 * Every consumer of a broker loopback URL that is not a cookie-carrying request (the JS fetch
 * wrapper, a WebSocket, a WebView navigation or subresource). Android's broker authenticates the
 * loopback by cookie; a native HTTP client cannot send it, so its URL must be registered with the
 * tunnel (`authorizeNativeFetch`, called by `resolveAssetUrl`'s observer and before each download).
 * A file that starts using one of these APIs fails this test until it is listed here with how it
 * authenticates: that review is the point.
 */
const TS_CONSUMERS: ReadonlyArray<{
  readonly name: string;
  readonly pattern: RegExp;
  readonly how: string;
  readonly files: readonly string[];
}> = [
  {
    name: "Expo downloader and uploader (plain OkHttp)",
    pattern: /File\.downloadFileAsync\(|\bfile\.upload\(/,
    how: "authorizeNativeFetch before each download; uploads mint the URL with resolveAssetUrl",
    files: ["lib/attachmentDownload.ts", "lib/attachmentUpload.ts"],
  },
  {
    name: "expo-image loads",
    pattern: /Image\.(loadAsync|prefetch|writeToCacheAsync)\(/,
    how: "URL minted by resolveAssetUrl (asset URL observer)",
    files: ["lib/projectFaviconDatabaseCache.ts"],
  },
  {
    name: "expo-video / expo-audio playback and frame extraction",
    pattern: /(useVideoPlayer|createVideoPlayer|useAudioPlayer|createAudioPlayer)\(/,
    how: "URL minted by resolveAssetUrl (asset URL observer); each range request is a new connection",
    files: [
      "components/MediaVideoPlayer.tsx",
      "features/files/AudioFilePreview.tsx",
      "lib/videoThumbnails.ts",
    ],
  },
  {
    name: "react-native-pdf-jsi",
    pattern: /from "react-native-pdf-jsi"/,
    how: "reads a local file that downloadAttachmentForPreview fetched (authorized download)",
    files: ["components/PdfPreview.android.tsx"],
  },
  {
    name: "WebView download listener and new windows",
    pattern: /onFileDownload|setDownloadListener|DownloadManager|onOpenWindow/,
    how: "default react-native-webview DownloadListener sends the CookieManager cookie (version pinned below); window.open goes through tryOpenExternalUrl, which refuses tunnel URLs",
    files: ["features/threads/HtmlRenderWebView.tsx"],
  },
  {
    name: "share sheets",
    pattern: /Share\.share\(|Sharing\.shareAsync\(|\bshareAsync\(/,
    how: "link shares go through shareUnlessPrivate; file shares send a local, downloaded file",
    files: [
      "features/pull-requests/pullRequestLink.ts",
      "lib/attachmentDownload.ts",
      "lib/shareFileFromSource.ts",
      "native/EnrichedMarkdownText.tsx",
    ],
  },
  {
    name: "hand-off to another app (intent)",
    pattern: /\bLinking\.openURL\(/,
    how: "none of these is given a loopback URL: remote pull-request, documentation, sign-in, settings and usage URLs, and the app's own widget URL; asset URLs go through tryOpenExternalUrl (refuses tunnel URLs) or openAssetUrl (downloads tunnel URLs and opens the local copy), as QuestionAnswerHistory does",
    files: [
      "features/connection/ConnectionDiagnosisDetails.tsx",
      "features/connection/t3team-NexiHostsSection.tsx",
      "features/development/render-counter.ts",
      "features/pull-requests/PullRequestRouteScreen.tsx",
      "features/pull-requests/PullRequestStatusRows.tsx",
      "features/pull-requests/usePullRequestListActions.ts",
      "features/settings/SettingsOpenSourceLicensesRouteScreen.tsx",
      "features/settings/SettingsProviderAccountsRouteScreen.tsx",
      "features/settings/components/SettingsLegalDocumentRouteScreen.tsx",
      "features/threads/ChatGptSharingStatus.tsx",
      "features/threads/ChatGptUsageLimitNotice.tsx",
      "features/usage/ChatGptUsageSummary.tsx",
      "features/usage/UsageLimitsPooled.tsx",
      "features/threads/QuestionAnswerHistory.tsx",
      "features/usage/UsageLimitsSection.tsx",
      "widgets/publishSubscriptionUsage.android.ts",
      "lib/openExternalUrl.ts",
    ],
  },
];

/** Native HTTP and WebView primitives in the Android modules; each needs a reviewed reason. */
const KOTLIN_PRIMITIVES =
  /\bURL\(|HttpURLConnection|OkHttp|okhttp3|DownloadManager|openStream|WebViewClient|WebChromeClient|DownloadListener|shouldInterceptRequest|android\.webkit\.WebView\b/;
const KOTLIN_ALLOWED: Readonly<Record<string, string>> = {
  "t3-composer-editor/android/src/main/java/expo/modules/t3composereditor/T3ChipIcons.kt":
    "chip icon URL(uri).openStream(): the URI is a project favicon asset URL minted by resolveAssetUrl, so it is registered with the tunnel",
  "t3-terminal/android/src/main/java/expo/modules/t3terminal/t3team-NexiBrokerModule.kt":
    "the broker's own OkHttp client: wss to the pinned broker origin, never the loopback",
  "t3-terminal/android/src/main/java/expo/modules/t3terminal/t3team-NexiLoopbackAuth.kt":
    "names OkHttp and WebView only in a comment; the listener makes no request",
};

describe("native consumers of loopback URLs", () => {
  it.each(TS_CONSUMERS)("$name: only the reviewed files use it", ({ pattern, files }) => {
    const found = sourceFiles()
      .filter((file) => pattern.test(read(file)))
      .map((file) => rel(root, file));
    expect(found.sort()).toEqual([...files].sort());
  });

  it("authorizes downloads before Expo's downloader and mints upload URLs with resolveAssetUrl", () => {
    const download = read(NodePath.join(root, "lib/attachmentDownload.ts"));
    const calls = [...download.matchAll(/File\.downloadFileAsync\(/g)];
    const authorizations = [...download.matchAll(/authorizeNativeFetch\(/g)];
    expect(calls).toHaveLength(2);
    expect(authorizations).toHaveLength(2);
    calls.forEach((call, index) => {
      expect(authorizations[index]!.index).toBeLessThan(call.index);
    });
    const upload = read(NodePath.join(root, "lib/attachmentUpload.ts"));
    expect(upload).toContain("resolveAssetUrl(currentConnection.value.httpBaseUrl, relativeUrl)");
  });

  it("registers the asset URL observer where the broker is wired", () => {
    const broker = read(NodePath.join(root, "connection/t3team-nexiBroker.ts"));
    expect(broker).toContain("setAssetUrlObserver(authorizeNativeFetch)");
  });

  it("hands no URL to another app unless tryOpenExternalUrl or shareUnlessPrivate vets it", () => {
    const markdown = read(NodePath.join(root, "native/EnrichedMarkdownText.tsx"));
    expect(markdown).toContain("shareUnlessPrivate(url,");
    expect(markdown).not.toMatch(/Share\.share\(\{ message: url \}\)/);
    const open = read(NodePath.join(root, "lib/openExternalUrl.ts"));
    expect(open.indexOf("isTunnelUrl(url)")).toBeGreaterThan(-1);
    expect(open.indexOf("isTunnelUrl(url)")).toBeLessThan(open.indexOf("Linking.openURL(url)"));
  });

  it("opens attachment and file-preview assets through openAssetUrl, never a bare Linking.openURL", () => {
    for (const file of [
      "features/threads/QuestionAnswerHistory.tsx",
      "features/files/ThreadFilesRouteScreen.tsx",
    ]) {
      const text = read(NodePath.join(root, file));
      expect(text, file).toContain("openAssetUrl(");
      expect(text, file).not.toMatch(/Linking\.openURL\(url\)/);
    }
  });

  it("has no native HTTP or WebView primitive in the Android modules beyond the reviewed ones", () => {
    const modules = NodePath.join(mobile, "modules");
    const files = walk(modules, (file) => /\/android\/src\/main\/.*\.(kt|java)$/.test(file));
    const found = files
      .filter((file) => KOTLIN_PRIMITIVES.test(read(file)))
      .map((file) => rel(modules, file));
    expect(found.sort()).toEqual(Object.keys(KOTLIN_ALLOWED).sort());
    expect(files.length).toBeGreaterThan(20);
  });

  it("defines no WebViewClient, DownloadListener or request interceptor of its own in the app config plugins", () => {
    const plugins = walk(NodePath.join(mobile, "plugins"), (file) => /\.(cjs|mjs|ts)$/.test(file));
    for (const file of plugins) {
      expect(read(file), file).not.toMatch(/DownloadListener|shouldInterceptRequest|WebViewClient/);
    }
  });

  it("pins the native libraries whose HTTP behavior was reviewed, so an upgrade is reviewed again", () => {
    const dependencies = JSON.parse(read(NodePath.join(mobile, "package.json"))).dependencies;
    expect({
      "react-native-webview": dependencies["react-native-webview"],
      "react-native-pdf-jsi": dependencies["react-native-pdf-jsi"],
      "expo-file-system": dependencies["expo-file-system"],
      "expo-image": dependencies["expo-image"],
      "expo-video": dependencies["expo-video"],
      "expo-audio": dependencies["expo-audio"],
    }).toEqual({
      "react-native-webview": "14.0.1",
      "react-native-pdf-jsi": "5.0.0",
      "expo-file-system": "~58.0.9",
      "expo-image": "~58.0.15",
      "expo-video": "~58.0.11",
      "expo-audio": "58.0.9",
    });
  });
});
