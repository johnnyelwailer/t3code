import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { isElectron } from "~/env";
import { syncDocumentWindowControlsOverlayClass } from "~/lib/windowControlsOverlay";

import { App } from "~/t3work/t3work-App";
import { OAuthCallbackPage } from "~/t3work/components/t3work-OAuthCallbackPage";
import { BackendProvider, createT3Backend } from "~/t3work/backend/t3work-index";

import "~/t3work/t3work-index.css";

function resolveWsBaseUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) return wsUrl;

  const httpUrl = import.meta.env.VITE_HTTP_URL?.trim();
  if (httpUrl) {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  return "ws://localhost:3773";
}

function Root() {
  const [backend] = useState(() => createT3Backend(resolveWsBaseUrl()));

  useEffect(() => {
    void backend.connect();
    return () => {
      void backend.disconnect();
    };
  }, [backend]);

  return (
    <BackendProvider backend={backend}>
      <App />
    </BackendProvider>
  );
}

const isOAuthCallback = window.location.pathname.startsWith("/oauth/callback");

if (isElectron) {
  syncDocumentWindowControlsOverlayClass();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isOAuthCallback ? <OAuthCallbackPage /> : <Root />}</StrictMode>,
);
