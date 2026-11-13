import { describe, expect, it } from "vitest";
import { DEFAULT_FAQS, FAQ_CATEGORIES, FAQ_PAGES } from "@/content/faq";
import { policyById } from "@/content/policies";

describe("FAQ content", () => {
  it("gives every question one unique id", () => {
    const ids = DEFAULT_FAQS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only publishes questions that have an answer or an approved policy", () => {
    for (const f of DEFAULT_FAQS.filter((x) => x.status === "published")) {
      if (f.policy) expect(policyById(f.policy), f.id).not.toBeNull();
      else expect(f.answer.trim().length, f.id).toBeGreaterThan(0);
    }
  });

  it("explains what's missing for every draft", () => {
    for (const f of DEFAULT_FAQS.filter((x) => x.status === "draft")) expect(f.needs, f.id).toBeTruthy();
  });

  it("uses only known categories and pages, and keeps the cancellation policy in one place", () => {
    const cats = new Set<string>(FAQ_CATEGORIES.map((c) => c.key));
    const pages = new Set<string>(FAQ_PAGES.map((p) => p.key));
    for (const f of DEFAULT_FAQS) {
      expect(cats.has(f.category), f.id).toBe(true);
      for (const c of f.alsoIn ?? []) expect(cats.has(c), f.id).toBe(true);
      for (const p of Object.keys(f.pages ?? {})) expect(pages.has(p), f.id).toBe(true);
      // Policy wording lives in content/policies.ts, never copied into an answer.
      expect(f.answer.includes("does not issue cash refunds for any services") && !f.policy && f.id !== "cash-refunds", f.id).toBe(false);
    }
  });

  it("avoids words Yalla doesn't use", () => {
    for (const f of DEFAULT_FAQS) {
      const text = `${f.question} ${f.answer}`.toLowerCase();
      for (const w of ["classroom", "daycare", "drop-off", "pick-up", "nap", "teacher", "school year"]) expect(text.includes(w), `${f.id}: ${w}`).toBe(false);
    }
  });
});
