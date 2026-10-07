/** Vendor name until the boot script stores a pack label on the document element. */
function bootAppName(): string {
  const fromPack = document.documentElement.dataset.bootAppName?.trim();
  return fromPack || "T3 Code";
}

/** Shows startup failures before React can replace the boot splash. */
export function showBootError(error: unknown) {
  const appName = bootAppName();
  console.error(`${appName} failed to start.`, error);
  const bootShell = document.getElementById("boot-shell");
  if (!bootShell) return;

  const content = document.createElement("div");
  content.id = "boot-error";
  content.setAttribute("role", "alert");

  const message = document.createElement("p");
  message.textContent = `${appName} could not load.`;
  content.append(message);

  if (import.meta.env.DEV && error instanceof Error) {
    const detail = document.createElement("p");
    detail.textContent = error.message;
    content.append(detail);
  }

  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());
  content.append(reload);
  bootShell.replaceChildren(content);
}
