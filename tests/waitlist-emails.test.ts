/** Joining a waitlist on the website: a warm welcome for a family new to Yalla, a short note for returning families. */
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { joinPublicWaitlist } from "@/lib/ops/public-booking";
import { addDaysISO, todayLA } from "@/lib/time";
import { db, program, reset, session } from "./helpers";

beforeEach(reset);

const join = (sessionId: string, child = { firstName: "Ava", lastName: "Rivera", birthDate: addDaysISO(todayLA(), -365 * 5) }) =>
  joinPublicWaitlist(db(), { guardian: { firstName: "Jordan", lastName: "Rivera", email: "jordan@example.com", phone: "619-555-0100" }, child, sessionId, baseUrl: "https://yalla.test" });
const sent = (key: string) => db().select().from(s.messages).where(eq(s.messages.templateKey, key));

describe("Waitlist emails", () => {
  it("a new family gets the welcome with a setup link; next time, just the short note", async () => {
    const camp = await program({ kind: "camp", name: "Camp Yalla", priceCents: 16000 });
    const a = await session(camp.id, { capacity: 0, title: "Camp Yalla · 4 – 7 years" }, 10, "09:00", "15:00");
    const b = await session(camp.id, { capacity: 0, title: "Camp Yalla · 4 – 7 years" }, 12, "09:00", "15:00");

    expect(await join(a.id)).toEqual({ ok: true });
    const [welcome] = await sent("waitlist_welcome");
    expect(welcome.subject).toBe("Welcome to Yalla! You’re on the waitlist for Camp Yalla");
    expect(welcome.body).toContain("Camp Yalla · 4 – 7 years");
    expect(welcome.body).toContain("Waiting: Ava");
    // The private setup link is sent, but never stored in the saved copy.
    expect(welcome.body).toContain("[private link removed]");
    expect(await sent("waitlist_joined")).toHaveLength(0);

    // Same family again (still no account): the short note, not a second welcome.
    expect(await join(b.id, { firstName: "Ava", lastName: "Rivera", birthDate: addDaysISO(todayLA(), -365 * 5) })).toEqual({ ok: true });
    expect(await sent("waitlist_welcome")).toHaveLength(1);
    const [note] = await sent("waitlist_joined");
    expect(note.subject).toMatch(/^You’re on the waitlist for Camp Yalla on /);
    expect(note.body).not.toContain("private link");
  });

  it("Flex: explains the 15-minute turn and shows a half day", async () => {
    const flex = await program({ slug: "yalla-flex", kind: "drop_in", name: "Yalla Flex", priceCents: 15000 });
    const day = await session(flex.id, { capacity: 0, minAgeMonths: 36, maxAgeMonths: 59, title: "Yalla Flex · 3 – 4 years" }, 10);
    const r = await joinPublicWaitlist(db(), { guardian: { firstName: "Sam", lastName: "Lee", email: "sam@example.com", phone: "619-555-0101" }, child: { firstName: "Mo", lastName: "Lee", birthDate: addDaysISO(todayLA(), -365 * 4) }, sessionId: day.id, baseUrl: "https://yalla.test", dayLength: "half" });
    expect(r).toEqual({ ok: true });
    const [m] = await sent("waitlist_welcome");
    expect(m.body).toContain("15 minutes to book");
    expect(m.body).toContain("8:30am–12:00pm · Half day");
  });
});
