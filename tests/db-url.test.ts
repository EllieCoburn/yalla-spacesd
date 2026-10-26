import { describe, expect, it } from "vitest";
import { databaseUrl } from "@/lib/db/url";

describe("database URL discovery", () => {
  it("strips Neon's channel_binding option and keeps sslmode", () => {
    const url = databaseUrl({ DATABASE_URL: "postgresql://u:p@ep-x-pooler.neon.tech/db?sslmode=require&channel_binding=require" })!;
    expect(url).toContain("sslmode=require");
    expect(url).not.toContain("channel_binding");
  });
  it("finds prefixed integration variables and ignores unpooled ones", () => {
    expect(databaseUrl({ STORAGE_DATABASE_URL_UNPOOLED: "postgres://a/unpooled", STORAGE_DATABASE_URL: "postgres://a/pooled" })).toBe("postgres://a/pooled");
    expect(databaseUrl({ STORAGE_URL: "postgres://a/x", NEON_AUTH_BASE_URL: "https://auth" })).toBe("postgres://a/x");
    expect(databaseUrl({})).toBeUndefined();
  });
});
