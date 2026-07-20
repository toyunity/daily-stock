import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getKisTokenCached } from "./finalize";
import * as kis from "./kis";

// Real ESM namespace objects are not extensible, so vi.spyOn cannot patch them.
// vi.mock is hoisted above the imports and replaces the module for the whole file.
vi.mock("./kis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./kis")>();
  return {
    ...actual,
    issueAccessToken: vi.fn(),
    getOverseasQuote: vi.fn(),
    getOverseasIndex: vi.fn(),
  };
});

const mocked = vi.mocked(kis);
const CREDS = { appkey: "k", appsecret: "s" };

/** Minimal stand-in for the supabase-js chain finalize uses. */
function fakeSupabase(opts: {
  readData?: unknown;
  readError?: { message: string } | null;
  writeError?: { message: string } | null;
}) {
  const upsert = vi.fn().mockResolvedValue({ error: opts.writeError ?? null });
  return {
    upsert,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.readData ?? null,
            error: opts.readError ?? null,
          }),
        }),
      }),
      upsert,
    }),
  };
}

describe("getKisTokenCached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.issueAccessToken.mockResolvedValue({ token: "FRESH", expiresIn: 86400 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("캐시가 충분히 남아 있으면 재사용하고 발급하지 않는다", async () => {
    const sb = fakeSupabase({
      readData: {
        value: {
          access_token: "CACHED",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      },
    });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("CACHED");
    expect(mocked.issueAccessToken).not.toHaveBeenCalled();
  });

  it("만료가 5분 이내로 임박하면 재발급한다", async () => {
    const sb = fakeSupabase({
      readData: {
        value: {
          access_token: "CACHED",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    const token = await getKisTokenCached(CREDS, sb as never);
    expect(token).toBe("FRESH");
    expect(mocked.issueAccessToken).toHaveBeenCalledOnce();
  });

  it("캐시 읽기가 실패하면 재발급한다", async () => {
    const sb = fakeSupabase({ readError: { message: "relation does not exist" } });
    expect(await getKisTokenCached(CREDS, sb as never)).toBe("FRESH");
  });

  it("캐시 쓰기가 실패해도 토큰은 반환한다", async () => {
    const sb = fakeSupabase({ writeError: { message: "permission denied" } });
    expect(await getKisTokenCached(CREDS, sb as never)).toBe("FRESH");
  });
});
