import { describe, expect, it, vi } from "vite-plus/test";
import { createNexiOAuth, type NexiTokenStorage } from "./t3team-nexiOAuth";
import fc from "fast-check";

function fixture() {
  let raw: string | null = null;
  let now = 0;
  const storage: NexiTokenStorage = {
    read: async () => raw,
    write: async (value) => {
      raw = value;
    },
    clear: async () => {
      raw = null;
    },
  };
  const fetcher = vi.fn<typeof fetch>();
  const sleeps: number[] = [];
  const account = createNexiOAuth(
    {
      app: "public-app",
      deviceEndpoint: "https://entra/device",
      tokenEndpoint: "https://entra/token",
    },
    storage,
    {
      fetch: fetcher,
      now: () => now,
      sleep: async (ms, signal) => {
        signal.throwIfAborted();
        sleeps.push(ms);
        now += ms;
      },
    },
  );
  const seed = (fields = {}) => {
    raw = JSON.stringify({
      access_token: "old",
      refresh_token: "refresh",
      expires_in: 3600,
      expiresAt: 0,
      ...fields,
    });
  };
  return {
    account,
    fetcher,
    sleeps,
    storage,
    seed,
    raw: () => raw,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const code = {
  device_code: "private-device-code",
  user_code: "ABCD",
  verification_uri: "https://microsoft.com/devicelogin",
  expires_in: 60,
  interval: 5,
};
const tokens = { access_token: "access", refresh_token: "rotated", expires_in: 3600 };

describe("Nexplore mobile public-client OAuth", () => {
  it("serializes sign-out after an already-started secure storage write", async () => {
    const f = fixture();
    const write = f.storage.write;
    let release!: () => void;
    let started = false;
    f.storage.write = async (value) => {
      started = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await write(value);
    };
    f.fetcher.mockResolvedValueOnce(json(tokens));
    const pending = f.account.poll(code, new AbortController().signal);
    await vi.waitFor(() => expect(started).toBe(true));
    const signedOut = f.account.signOut();
    release();
    await expect(pending).rejects.toThrow("cancelled");
    await signedOut;
    expect(f.raw()).toBeNull();
  });
  it("never saves issuer tokens with nonpositive lifetimes", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -2147483648, max: 0 }), async (expires_in) => {
        const f = fixture();
        f.fetcher.mockResolvedValueOnce(json({ ...tokens, expires_in }));
        await expect(f.account.poll(code, new AbortController().signal)).rejects.toThrow();
        expect(f.raw()).toBeNull();
      }),
    );
  });
  it("requests only the public app id and broker scope and exposes the user code", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json(code));
    expect(await f.account.requestCode(new AbortController().signal)).toEqual(code);
    const [url, init] = f.fetcher.mock.calls[0]!;
    expect(url).toBe("https://entra/device");
    expect(new URLSearchParams(init?.body as string).get("scope")).toBe(
      "api://public-app/relay.access openid profile offline_access",
    );
    expect(init?.body).not.toContain("secret");
    expect(f.raw()).toBeNull();
  });
  it("respects pending, slow_down, transport and 5xx retries before securely saving tokens", async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(json({ error: "authorization_pending" }, 400))
      .mockResolvedValueOnce(json({ error: "slow_down" }, 400))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(tokens));
    expect(await f.account.poll(code, new AbortController().signal)).toBe("access");
    expect(f.sleeps).toEqual([5000, 5000, 10000, 10000, 10000]);
    expect(JSON.parse(f.raw()!)).toMatchObject({ ...tokens, expiresAt: 3640000 });
    expect(f.fetcher.mock.calls.every(([url]) => url === "https://entra/token")).toBe(true);
    expect(new URLSearchParams(f.fetcher.mock.calls[0]![1]?.body as string).get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:device_code",
    );
  });
  it.each(["authorization_declined", "expired_token"])(
    "stops for %s without saving tokens",
    async (error) => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error }, 400));
      await expect(f.account.poll(code, new AbortController().signal)).rejects.toThrow(
        /expired|declined/,
      );
      expect(f.raw()).toBeNull();
    },
  );
  it("stops polling at local expiry even if the issuer remains unavailable", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValue(json({}, 503));
    await expect(
      f.account.poll({ ...code, expires_in: 10 }, new AbortController().signal),
    ).rejects.toThrow("expired");
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels polling before another network request", async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(f.account.poll(code, controller.signal)).rejects.toBeDefined();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("reuses valid tokens without network traffic", async () => {
    const f = fixture();
    f.seed({ expiresAt: 3600000 });
    expect(await f.account.accessToken()).toBe("old");
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("refreshes once for concurrent requests and keeps rotated refresh tokens", async () => {
    const f = fixture();
    f.seed();
    f.fetcher.mockResolvedValueOnce(json(tokens));
    expect(await Promise.all([f.account.accessToken(), f.account.accessToken()])).toEqual([
      "access",
      "access",
    ]);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.raw()!).refresh_token).toBe("rotated");
    const body = new URLSearchParams(f.fetcher.mock.calls[0]![1]?.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("scope")).toContain("relay.access");
  });
  it("retains the previous refresh token when Entra omits rotation", async () => {
    const f = fixture();
    f.seed();
    f.fetcher.mockResolvedValueOnce(json({ access_token: "new", expires_in: 3600 }));
    await f.account.accessToken();
    expect(JSON.parse(f.raw()!).refresh_token).toBe("refresh");
  });
  it.each([400, 401])("clears a rejected refresh grant (%s)", async (status) => {
    const f = fixture();
    f.seed();
    f.fetcher.mockResolvedValueOnce(json({ error: "invalid_grant" }, status));
    await expect(f.account.accessToken()).rejects.toThrow("refresh");
    expect(f.raw()).toBeNull();
  });
  it("keeps a refresh grant through issuer downtime", async () => {
    const f = fixture();
    f.seed();
    f.fetcher.mockResolvedValueOnce(json({}, 503));
    await expect(f.account.accessToken()).rejects.toThrow("refresh");
    expect(f.raw()).toContain("refresh");
  });
  it("does not restore a signed-out account when an in-flight refresh completes", async () => {
    const f = fixture();
    f.seed();
    let respond!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const pending = f.account.accessToken();
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalled());
    await f.account.signOut();
    respond(json(tokens));
    await expect(pending).rejects.toThrow("cancelled");
    expect(f.raw()).toBeNull();
  });
  it("rejects corrupt persisted tokens and malformed issuer responses", async () => {
    const f = fixture();
    await f.storage.write("{}");
    await expect(f.account.accessToken()).rejects.toThrow("again");
    expect(f.raw()).toBeNull();
    f.fetcher.mockResolvedValueOnce(json({ ...code, verification_uri: "http://unsafe" }));
    await expect(f.account.requestCode(new AbortController().signal)).rejects.toThrow("Unsafe");
    f.fetcher.mockResolvedValueOnce(json({ access_token: "access", expires_in: -1 }));
    await expect(f.account.poll(code, new AbortController().signal)).rejects.toThrow();
    expect(f.raw()).toBeNull();
  });
});
