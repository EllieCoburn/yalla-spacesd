import { afterEach, describe, expect, it, vi } from "vitest";
import { deliver } from "@/lib/notify";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Postmark delivery", () => {
  it("sends a plain-text email on the outbound stream with the server token", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "test-token");
    vi.stubEnv("NOTIFICATIONS_FROM", "Yalla <hello@example.com>");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ MessageID: "abc-123", ErrorCode: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await deliver("parent@example.com", "Hello", "Body text");

    expect(r).toEqual({ ok: true, ref: "abc-123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect((init.headers as Record<string, string>)["X-Postmark-Server-Token"]).toBe("test-token");
    expect(JSON.parse(String(init.body))).toEqual({ From: "Yalla <hello@example.com>", To: "parent@example.com", Subject: "Hello", TextBody: "Body text", MessageStream: "outbound" });
  });

  it("reports Postmark's error message when a send is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ErrorCode: 400, Message: "Sender signature not confirmed" }), { status: 422 })));
    expect(await deliver("parent@example.com", "Hello", "Body")).toEqual({ ok: false, error: "Sender signature not confirmed" });
  });
});
