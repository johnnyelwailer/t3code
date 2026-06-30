# Concrete End-to-End Example: What Happens When a User Clicks

This traces a REAL flow through t3code.

---

## Flow 1: User Connects Jira (What Already Exists)

### User clicks: "Connect with API token"

```tsx
// apps/web/src/t3work/t3work-CreateProjectDialog.tsx line 101
<Button onClick={() => void connectBasic()}>Connect with API token</Button>
```

### onClick handler calls connectBasic()

```ts
// apps/web/src/t3work/hooks/t3work-useCreateProject.ts line 74
const connectBasic = async () => {
  await setup.loadAccountsWithBasic({ siteUrl, email, apiToken });
};

// That calls:
const loadAccountsWithBasic = useCallback(
  async (credentials: AtlassianBasicCredentials) => {
    try {
      const loadedAccounts = await backend.atlassian.connectBasic({
        siteUrl: credentials.siteUrl,
        email: credentials.email,
        apiToken: credentials.apiToken,
      });
      setAccounts(loadedAccounts); // ← UPDATE BROWSER STATE
      setStep("account"); // ← SHOW NEXT SCREEN
    } catch (e) {
      setError(e.message);
    }
  },
  [backend],
);
```

### What is `backend.atlassian.connectBasic`?

```ts
// apps/web/src/t3work/backend/t3work-t3Backend.ts line 92
const atlassian = {
  async connectBasic(input: AtlassianBasicConnectInput) {
    const response = await postJson(
      httpBaseUrl,
      "/api/t3work/atlassian/connect/basic", // ← WHAT URL?
      {
        auth: {
          kind: "basic",
          siteUrl: input.siteUrl,
          email: input.email,
          apiToken: input.apiToken,
        },
      },
    );
    return response.accounts; // ← BROWSER RECEIVES THIS
  },
};
```

**It's just an HTTP POST call.** That's it. No fancy event system. Just a POST request.

### Server receives the HTTP POST

```ts
// apps/server/src/t3work-atlassian-routes.ts line 32
export const t3workAtlassianConnectBasicRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/connect/basic", // ← MATCHES THE URL
  Effect.gen(function* () {
    yield* loadPersistedAuths;
    const input = yield* readJsonBody<BasicConnectInput>();

    // Call the Atlassian provider
    const provider = new AtlassianIntegrationProvider(input.auth);
    const accounts = yield* tryAtlassianPromise(
      () => provider.listAccounts(), // ← CALLS ACTUAL JIRA API
      "Failed to connect to Atlassian.",
    );

    // Save to disk
    for (const account of accounts) {
      setAtlassianAuth(account.id, input.auth);
    }
    yield* savePersistedAuths;

    // Send back to browser
    return okJson({ accounts }); // ← RESPONSE SENT HERE
  }).pipe(Effect.catch(errorResponse)),
);
```

### Browser receives the response

```ts
// Back in the hook:
const loadedAccounts = await backend.atlassian.connectBasic(...);
// ↑ This resolves with { accounts: [...] }

setAccounts(loadedAccounts);  // ← Browser state updates
setStep("account");           // ← UI re-renders to show account list
```

### What You See in Browser

Before:

```
Input fields for: Site URL, Email, API Token
[Connect with API token] button
```

After user clicks and request completes:

```
List of Atlassian accounts:
- "My Company" (Jira)
- "Side Project" (Jira)

[Back] [Continue]
```

**That's it.** No events, no "listeners", no fancy stuff. Just:

1. User clicks button
2. HTTP POST to server
3. Server calls Jira API
4. Returns response
5. Browser updates state
6. UI re-renders

---

## Flow 2: User Loads Jira Issues (Still Direct HTTP, No Tools Yet)

### User clicks "Continue" with selected account

```ts
// apps/web/src/t3work/hooks/t3work-useCreateProject.ts line 127
const continueWithAccount = async () => {
  if (!setup.selectedAccount) return;
  await setup.loadProjects(setup.selectedAccount);
};

// That calls:
const loadProjectsWithProvider = useCallback(
  async (account: IntegrationAccount) => {
    const projs = await backend.atlassian.listProjects({
      id: account.id,
      provider: account.provider, // "atlassian"
    });
    setProjects(projs); // ← UPDATE BROWSER STATE
    setStep("project"); // ← SHOW PROJECT LIST
  },
  [backend],
);
```

### HTTP request to server

```ts
// apps/web/src/t3work/backend/t3work-t3Backend.ts line 130
async listProjects(account: IntegrationAccountRef): Promise<ReadonlyArray<ExternalProject>> {
  const response = await postJson(
    httpBaseUrl,
    "/api/t3work/atlassian/projects",  // ← ANOTHER HTTP CALL
    account,  // { id: "account-123", provider: "atlassian" }
  );
  return response.projects;
}
```

### Server receives and fetches from Jira

```ts
// apps/server/src/t3work-atlassian-routes.ts line 109
export const t3workAtlassianProjectsRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/atlassian/projects",
  Effect.gen(function* () {
    const account = yield* readJsonBody<IntegrationAccountRef>();
    const provider = yield* providerForAccount(account.id); // ← LOADS SAVED AUTH
    const projects = yield* tryAtlassianPromise(
      () => provider.listProjects(account), // ← CALLS JIRA API
      "Failed to load Atlassian projects.",
    );
    return okJson({ projects }); // ← SEND BACK
  }).pipe(Effect.catch(errorResponse)),
);
```

### Browser receives and renders

```ts
setProjects(projs); // [{ id: "ABC", title: "Project ABC", key: "ABC" }, ...]
setStep("project"); // UI shows: "Select a project to add"
```

**You see a list of Jira projects.**

---

## Flow 3: User Creates Project from Jira (Still Direct)

### User clicks "Add project"

```ts
// apps/web/src/t3work/hooks/t3work-useCreateProject.ts line 155
const createSelectedProject = async () => {
  const project = await setup.createProject(setup.selectedProject);
  onCreated(project); // ← DIALOG CLOSES, PROJECT CREATED
};

// That calls the backend:
const createProject = useCallback(
  async (externalProject: ExternalProject) => {
    setStep("creating");
    const createdProject = await backend.createProject({
      externalProjectId: externalProject.id,
      account: selectedAccount,
    });
    setStep("created");
    return createdProject;
  },
  [backend],
);
```

### Another HTTP call to server

```ts
// apps/web/src/t3work/backend/t3work-t3Backend.ts line 165
async createProject(input: CreateProjectInput): Promise<ProjectShellProject> {
  const response = await postJson(
    httpBaseUrl,
    "/api/t3work/projects/create",  // ← YET ANOTHER HTTP CALL
    input,  // { externalProjectId, account }
  );
  return response.project;
}
```

### Server handles it

```ts
// (Hypothetically - this route probably exists somewhere)
POST /api/t3work/projects/create
{
  externalProjectId: "ABC",
  account: { id: "jira-account-1", provider: "atlassian" }
}

Server does:
1. Create local project directory
2. Cache the Jira project metadata
3. Return: { projectId: "proj-123", title: "Project ABC", ... }
```

### Browser receives and closes dialog

```ts
onCreated(project); // Dialog closes, user sees new project in sidebar
```

---

## The Key Question: "What is callIntegration? Where is it?"

**`callIntegration` doesn't exist yet.** That's something we need to BUILD.

Right now, every integration feature (list accounts, list projects) is hardcoded as a separate HTTP route:

- `POST /api/t3work/atlassian/connect/basic`
- `POST /api/t3work/atlassian/projects`
- `POST /api/t3work/atlassian/resources`
- etc.

**When we build the tool system, `callIntegration` would be:**

```ts
// What we NEED to build (doesn't exist yet):
async function callIntegration(toolName: string, inputs: unknown) {
  // Tool: "integration.resources.list"
  // Inputs: { accountId: "...", projectId: "..." }

  if (toolName === "integration.resources.list") {
    const adapter = yield * ProviderAdapterRegistry.getByInstance(instanceId);
    const result = yield * adapter.listResources(inputs); // ← Generic call
    return result;
  }

  // Same for all tools: no branching on provider
}
```

---

## The Other Key Question: "Why emit orchestration events? Who listens?"

**Current situation:** Browser makes direct HTTP calls. Server responds. Done.

**Future situation (with tools):** Skills call tools → tools emit events → browser renders.

### Example: When a Recipe Launches and Uses a Tool

```
Browser: User clicks recipe "List Jira Issues"
  ↓
Provider (Codex/Claude) receives recipe + tools
  ↓
Provider calls: tool("integration.resources.list", { projectId: "ABC" })
  ↓
Server tool handler processes it
  ↓
Tool EMITS: OrchestrationThreadActivity {
    kind: "integration.resources.list",
    summary: "Found 42 issues",
    payload: { count: 42, fields: [...] }
  }
  ↓
Server PUBLISHES to WebSocket: {
    type: "thread.activity-appended",
    threadId: "...",
    activity: { ... }
  }
  ↓
Browser RECEIVES on WebSocket listener: orchestration.subscribeThread(threadId, (event) => {
    if (event.type === "thread.activity-appended") {
      addTimelineEntry(event.activity);  // ← UI updates
    }
  })
  ↓
UI renders in timeline: "Found 42 issues"
```

**Who listens?** The browser, via WebSocket subscription to the orchestration channel.

**Where?** In ChatView.tsx or similar - it subscribes when the thread loads.

```tsx
// apps/web/src/components/ChatView.tsx (pseudocode)
useEffect(() => {
  const unsubscribe = api.orchestration.subscribeThread(threadId, (event: OrchestrationEvent) => {
    if (event.type === "thread.activity-appended") {
      updateTimeline(event.activity);
    }
  });
  return unsubscribe;
}, [threadId]);
```

---

## Summary: The Missing Piece

**What exists:**

- Direct HTTP routes for Atlassian integration
- Simple request/response pattern
- Browser → Server → Jira API → Server → Browser

**What doesn't exist (yet):**

- Generic tool handler that can call ANY integration
- Tool invocation from skills/recipes
- Orchestration event emission from tools
- Provider-agnostic tool registry

**What you need to build:**

1. `callIntegration(toolName, inputs)` — the generic handler
2. Tool definitions in `packages/t3work-skill-tools`
3. Tool handler registry
4. Recipe → Tool launcher
5. Event emission when tools run

That's the actual gap. Everything else is architecture and abstractions that already exist.
