import { describe, expect, it, vi } from "vite-plus/test";
import {
  createNexiOAuth,
  NexiSignInRequiredError,
  type NexiTokenStorage,
} from "./t3team-nexiOAuth";
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
  describe("fresh access tokens (host pairing needs an Entra token minutes old)", () => {
    it("refreshes a still-valid cached token and stores the rotated one", async () => {
      const f = fixture();
      f.seed({ expiresAt: 3600000 });
      f.fetcher.mockResolvedValueOnce(json(tokens));
      expect(await f.account.accessToken({ fresh: true })).toBe("access");
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(f.raw()!)).toMatchObject({
        access_token: "access",
        refresh_token: "rotated",
      });
      // The refreshed token is then served from the cache, so a later plain read costs nothing.
      expect(await f.account.accessToken()).toBe("access");
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    });
    it("shares one refresh between concurrent fresh and plain callers", async () => {
      const f = fixture();
      f.seed();
      f.fetcher.mockResolvedValueOnce(json(tokens));
      expect(
        await Promise.all([f.account.accessToken({ fresh: true }), f.account.accessToken()]),
      ).toEqual(["access", "access"]);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    });
    it("asks for sign-in instead of serving a cached token it cannot refresh", async () => {
      const f = fixture();
      f.seed({ expiresAt: 3600000, refresh_token: undefined });
      await expect(f.account.accessToken({ fresh: true })).rejects.toBeInstanceOf(
        NexiSignInRequiredError,
      );
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(f.raw()).toBeNull();
    });
    it("keeps the cached token and refresh grant through issuer downtime", async () => {
      const f = fixture();
      f.seed({ expiresAt: 3600000 });
      f.fetcher.mockResolvedValueOnce(json({}, 503));
      await expect(f.account.accessToken({ fresh: true })).rejects.toThrow("refresh");
      expect(JSON.parse(f.raw()!)).toMatchObject({ access_token: "old", refresh_token: "refresh" });
    });
    it("clears a rejected refresh grant", async () => {
      const f = fixture();
      f.seed({ expiresAt: 3600000 });
      f.fetcher.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
      await expect(f.account.accessToken({ fresh: true })).rejects.toBeInstanceOf(
        NexiSignInRequiredError,
      );
      expect(f.raw()).toBeNull();
    });
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
  describe("in-flight refresh across account generations", () => {
    const deferred = <A>() => {
      let resolve!: (value: A) => void;
      const promise = new Promise<A>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    /** Starts a refresh whose issuer response the test releases explicitly. */
    const startStaleRefresh = async (f: ReturnType<typeof fixture>) => {
      f.seed();
      const reached = deferred<void>();
      const issuer = deferred<Response>();
      f.fetcher.mockImplementationOnce(() => {
        reached.resolve();
        return issuer.promise;
      });
      const pending = f.account.accessToken();
      await reached.promise;
      return { pending, issuer };
    };
    const countClears = (f: ReturnType<typeof fixture>) => {
      const clear = f.storage.clear;
      const calls = { count: 0 };
      f.storage.clear = async () => {
        calls.count++;
        await clear();
      };
      return calls;
    };

    it("does not clear a newer sign-in when a stale refresh is rejected", async () => {
      const f = fixture();
      const { pending, issuer } = await startStaleRefresh(f);
      await f.account.signOut();
      f.fetcher.mockResolvedValueOnce(json({ ...tokens, access_token: "new-account" }));
      await f.account.poll(code, new AbortController().signal);
      issuer.resolve(json({ error: "invalid_grant" }, 400));
      await expect(pending).rejects.toThrow("cancelled");
      expect(JSON.parse(f.raw()!).access_token).toBe("new-account");
    });
    it("does not invalidate a pending sign-in poll when a stale refresh is rejected", async () => {
      const f = fixture();
      const { pending, issuer } = await startStaleRefresh(f);
      await f.account.signOut();
      const pollReached = deferred<void>();
      const pollIssuer = deferred<Response>();
      f.fetcher.mockImplementationOnce(() => {
        pollReached.resolve();
        return pollIssuer.promise;
      });
      const poll = f.account.poll(code, new AbortController().signal);
      await pollReached.promise;
      issuer.resolve(json({ error: "interaction_required" }, 400));
      await expect(pending).rejects.toThrow("cancelled");
      pollIssuer.resolve(json(tokens));
      expect(await poll).toBe("access");
    });
    it("signs out only once when the signed-out refresh is then rejected", async () => {
      const f = fixture();
      const clears = countClears(f);
      const { pending, issuer } = await startStaleRefresh(f);
      await f.account.signOut();
      issuer.resolve(json({ error: "invalid_grant" }, 400));
      await expect(pending).rejects.toThrow("cancelled");
      expect(clears.count).toBe(1);
      expect(f.raw()).toBeNull();
    });
    it("leaves a signed-out account alone when its refresh fails transiently", async () => {
      const f = fixture();
      const clears = countClears(f);
      const { pending, issuer } = await startStaleRefresh(f);
      await f.account.signOut();
      issuer.resolve(json({}, 503));
      await expect(pending).rejects.toThrow("refresh");
      expect(clears.count).toBe(1);
      expect(f.raw()).toBeNull();
    });
    it("refreshes a new account instead of joining the signed-out account's refresh", async () => {
      const f = fixture();
      const { pending, issuer } = await startStaleRefresh(f);
      await f.account.signOut();
      // Short-lived tokens are inside the refresh window as soon as they are saved.
      f.fetcher.mockResolvedValueOnce(
        json({ access_token: "new-account", refresh_token: "r2", expires_in: 30 }),
      );
      await f.account.poll(code, new AbortController().signal);
      f.fetcher.mockResolvedValueOnce(
        json({ access_token: "new-account-refreshed", refresh_token: "r3", expires_in: 3600 }),
      );
      const second = f.account.accessToken();
      issuer.resolve(json(tokens));
      await expect(pending).rejects.toThrow("cancelled");
      expect(await second).toBe("new-account-refreshed");
      const bodies = f.fetcher.mock.calls.map(([, init]) =>
        new URLSearchParams(init?.body as string).get("refresh_token"),
      );
      expect(bodies).toEqual(["refresh", null, "r2"]);
      expect(JSON.parse(f.raw()!).access_token).toBe("new-account-refreshed");
    });
    it("shares one rejected refresh between concurrent callers and signs out once", async () => {
      const f = fixture();
      const clears = countClears(f);
      f.seed();
      f.fetcher.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
      const results = await Promise.allSettled([f.account.accessToken(), f.account.accessToken()]);
      expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(clears.count).toBe(1);
      expect(f.raw()).toBeNull();
    });
    it("starts a new refresh after the previous one failed", async () => {
      const f = fixture();
      f.seed();
      f.fetcher.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(tokens));
      await expect(f.account.accessToken()).rejects.toThrow("refresh");
      expect(await f.account.accessToken()).toBe("access");
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    });
    it.each([
      ["a network error", () => Promise.reject(new TypeError("Network request failed"))],
      ["a throttled response", () => Promise.resolve(json({ error: "slow_down" }, 429))],
      [
        "a temporary issuer error",
        () => Promise.resolve(json({ error: "temporarily_unavailable" }, 400)),
      ],
    ])("keeps the refresh grant after %s and does not ask for sign-in", async (_name, respond) => {
      const f = fixture();
      f.seed();
      f.fetcher.mockImplementationOnce(respond);
      const error = await f.account.accessToken().catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(NexiSignInRequiredError);
      expect(f.raw()).toContain("refresh");
    });

    describe("switching accounts without signing out", () => {
      const accountB = { access_token: "B", refresh_token: "rB", expires_in: 3600 };
      /** Completes a device-code sign-in for account B while A's refresh is still in flight. */
      const signInB = async (f: ReturnType<typeof fixture>) => {
        f.fetcher.mockResolvedValueOnce(json(accountB));
        expect(await f.account.poll(code, new AbortController().signal)).toBe("B");
        expect(JSON.parse(f.raw()!).access_token).toBe("B");
      };

      it("keeps account B when A's in-flight refresh then succeeds", async () => {
        const f = fixture();
        const { pending, issuer } = await startStaleRefresh(f);
        await signInB(f);
        issuer.resolve(json({ access_token: "A-new", refresh_token: "rA2", expires_in: 3600 }));
        await expect(pending).rejects.toThrow("cancelled");
        expect(JSON.parse(f.raw()!).access_token).toBe("B");
        expect(await f.account.accessToken()).toBe("B");
      });
      it("keeps account B when A's in-flight refresh is then rejected", async () => {
        const f = fixture();
        const clears = countClears(f);
        const { pending, issuer } = await startStaleRefresh(f);
        await signInB(f);
        issuer.resolve(json({ error: "invalid_grant" }, 400));
        await expect(pending).rejects.toThrow("cancelled");
        expect(clears.count).toBe(0);
        expect(JSON.parse(f.raw()!).access_token).toBe("B");
      });
      it("lets B refresh on its own instead of joining A's in-flight refresh", async () => {
        const f = fixture();
        const { pending, issuer } = await startStaleRefresh(f);
        f.fetcher.mockResolvedValueOnce(json({ ...accountB, expires_in: 30 }));
        await f.account.poll(code, new AbortController().signal);
        f.fetcher.mockResolvedValueOnce(json({ access_token: "B2", expires_in: 3600 }));
        const second = f.account.accessToken();
        issuer.resolve(json({ access_token: "A-new", expires_in: 3600 }));
        await expect(pending).rejects.toThrow("cancelled");
        expect(await second).toBe("B2");
        const refreshTokens = f.fetcher.mock.calls.map(([, init]) =>
          new URLSearchParams(init?.body as string).get("refresh_token"),
        );
        expect(refreshTokens).toEqual(["refresh", null, "rB"]);
      });
      it("keeps the most recent successful sign-in when two polls complete", async () => {
        const f = fixture();
        f.fetcher.mockResolvedValueOnce(json({ ...accountB, access_token: "first" }));
        f.fetcher.mockResolvedValueOnce(json({ ...accountB, access_token: "second" }));
        expect(await f.account.poll(code, new AbortController().signal)).toBe("first");
        expect(await f.account.poll(code, new AbortController().signal)).toBe("second");
        expect(JSON.parse(f.raw()!).access_token).toBe("second");
      });
      it("cancels a poll that was started before a sign-out and finishes afterwards", async () => {
        const f = fixture();
        const reached = deferred<void>();
        const issuer = deferred<Response>();
        f.fetcher.mockImplementationOnce(() => {
          reached.resolve();
          return issuer.promise;
        });
        const poll = f.account.poll(code, new AbortController().signal);
        await reached.promise;
        await f.account.signOut();
        issuer.resolve(json(accountB));
        await expect(poll).rejects.toThrow("cancelled");
        expect(f.raw()).toBeNull();
      });
      it("signs in normally after a sign-out", async () => {
        const f = fixture();
        f.seed();
        await f.account.signOut();
        await signInB(f);
        expect(await f.account.accessToken()).toBe("B");
      });
      it("does not bump the account for a malformed or declined sign-in response", async () => {
        const f = fixture();
        const { pending, issuer } = await startStaleRefresh(f);
        f.fetcher.mockResolvedValueOnce(json({ access_token: "B", expires_in: -1 }));
        await expect(f.account.poll(code, new AbortController().signal)).rejects.toThrow();
        issuer.resolve(json({ access_token: "A-new", refresh_token: "rA2", expires_in: 3600 }));
        expect(await pending).toBe("A-new");
        expect(JSON.parse(f.raw()!).access_token).toBe("A-new");
      });
    });
    it("never returns a signed-out token to a call made right after sign-out starts", async () => {
      const f = fixture();
      f.seed({ expiresAt: 3_600_000 });
      const signedOut = f.account.signOut();
      const error = await f.account.accessToken().catch((cause: unknown) => cause);
      await signedOut;
      expect(error).toBeInstanceOf(NexiSignInRequiredError);
      expect(f.raw()).toBeNull();
    });
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
