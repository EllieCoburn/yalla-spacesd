/**
 * "Ask the handbook": finds the handbook section that answers a family's question, or says honestly
 * that the handbook doesn't cover it. Runs entirely in the browser (no outside service): a small
 * BM25-style ranker over each section's title, short answer, example questions, text and program notes,
 * with light stemming and everyday synonyms ("nap" finds rest time, "pick up" finds departure).
 *
 * It only ever answers with Yalla's own words, so it can't make anything up. When nothing matches well
 * enough, the caller offers to send the question to Team Yalla.
 */
import type { HandbookEntry, HandbookProgram } from "@/content/handbook";

const STOP = new Set(
  "a an and are as at be been but by can could do does did for from get got had has have how i if in into is it its just me my mine of on or our please should so than that the their them then there these they this to too up us was we were what when where which who why will with would you your yours yalla child childs children kid kids son daughter baby toddler there's what's i'm im okay ok hi hello thanks thank need want know tell about any some there allowed".split(
    " ",
  ),
);

/** Everyday words → the words the handbook uses. Applied after stemming. */
const SYNONYMS: Record<string, string[]> = {
  nap: ["rest", "sleep"],
  sleep: ["rest", "nap"],
  rest: ["nap", "sleep"],
  pickup: ["departure", "collect"],
  collect: ["departure"],
  dropoff: ["arrival"],
  drop: ["arrival"],
  late: ["departure", "late"],
  sick: ["illness", "ill", "unwell"],
  ill: ["illness", "sick"],
  unwell: ["illness"],
  fever: ["illness", "symptom"],
  vomit: ["illness"],
  throw: ["illness"],
  diarrhea: ["illness"],
  covid: ["pandemic", "outbreak"],
  medicine: ["medication"],
  meds: ["medication"],
  tylenol: ["medication"],
  motrin: ["medication"],
  ibuprofen: ["medication"],
  antibiotic: ["medication"],
  inhaler: ["medication", "emergency"],
  epipen: ["medication", "allergy"],
  potty: ["toilet", "toileting", "pull"],
  toilet: ["potty", "toileting"],
  bathroom: ["toilet", "potty"],
  diaper: ["diapering", "pull", "wipe"],
  nappy: ["diaper"],
  food: ["lunch", "snack", "meal"],
  eat: ["lunch", "meal", "snack", "food"],
  lunch: ["meal", "food"],
  snack: ["snacks", "food"],
  drink: ["water", "beverage"],
  juice: ["sugary", "drink", "water"],
  milk: ["breast", "formula", "bottle"],
  breastmilk: ["breast", "milk"],
  pump: ["breast", "milk"],
  nurse: ["breastfeeding", "nursing"],
  nursing: ["breastfeeding"],
  breastfeed: ["breastfeeding", "nursing"],
  cost: ["price", "fee", "tuition", "rate"],
  price: ["cost", "fee", "rate"],
  pay: ["payment", "tuition", "invoice"],
  bill: ["payment", "tuition", "billing"],
  money: ["payment", "refund", "credit"],
  refund: ["credit", "wallet", "cancel"],
  cancel: ["cancellation", "credit", "notice"],
  quit: ["withdraw", "notice", "cancel"],
  withdraw: ["notice", "membership"],
  holiday: ["closure", "closed", "break"],
  vacation: ["break", "closure", "trip"],
  closed: ["closure", "holiday"],
  open: ["hours", "time"],
  hour: ["hours", "time"],
  time: ["hours"],
  teacher: ["educarer", "guide", "team"],
  staff: ["team", "educarer", "guide"],
  nanny: ["authorized", "collect"],
  grandparent: ["authorized", "collect"],
  grandma: ["authorized", "collect"],
  grandpa: ["authorized", "collect"],
  phone: ["call", "contact"],
  call: ["phone", "contact"],
  email: ["contact"],
  contact: ["phone", "email"],
  photo: ["photography", "picture"],
  picture: ["photo", "photography"],
  video: ["photo"],
  tv: ["screen"],
  ipad: ["screen", "tablet"],
  tablet: ["screen"],
  hit: ["conflict", "behavior", "aggression"],
  push: ["conflict"],
  fight: ["conflict"],
  bit: ["biting", "bite"],
  bite: ["biting"],
  hurt: ["injury", "incident"],
  fall: ["falls", "injury"],
  fell: ["falls", "injury"],
  bump: ["injury"],
  shoe: ["shoes"],
  wear: ["clothing", "clothes"],
  clothe: ["clothing"],
  pack: ["bring", "provide"],
  bring: ["provide"],
  toy: ["belongings", "home"],
  lose: ["lost"],
  lost: ["belongings"],
  allergic: ["allergy"],
  allergy: ["allergies", "diet"],
  vegan: ["diet"],
  vegetarian: ["diet"],
  gluten: ["allergy", "diet"],
  dairy: ["allergy", "diet"],
  vaccine: ["immunization"],
  shot: ["immunization"],
  form: ["paperwork"],
  stay: ["onsite"],
  leave: ["onsite", "notice"],
  errand: ["onsite", "leave"],
  onsite: ["stay", "premises"],
  ratio: ["ratios"],
  group: ["cohort", "age"],
  class: ["cohort", "group"],
  room: ["cohort", "group"],
  age: ["group", "cohort"],
  old: ["age"],
  sibling: ["siblings", "discount"],
  brother: ["sibling"],
  sister: ["sibling"],
  twin: ["sibling"],
  complaint: ["concern", "grievance"],
  complain: ["concern"],
  upset: ["concern"],
  smoke: ["air", "quality"],
  quake: ["earthquake"],
  rain: ["weather", "flood"],
  sunscreen: ["topical", "medication"],
  cream: ["topical", "diaper"],
  park: ["parking"],
  wifi: ["coworking"],
  work: ["coworking"],
};

/** A few everyday phrases joined before tokenizing. */
const PHRASES: [RegExp, string][] = [
  [/\bpick(ing|ed)?[\s-]?ups?\b/g, " pickup "],
  [/\bdrop(ping|ped)?[\s-]?offs?\b/g, " dropoff "],
  [/\bthrow(ing|n)?\s+up\b/g, " vomit "],
  [/\bscreen[\s-]?time\b/g, " screen "],
  [/\bbreast[\s-]?milk\b/g, " breastmilk "],
  [/\bpull[\s-]?ups?\b/g, " pull "],
  [/\bepi[\s-]?pens?\b/g, " epipen "],
  [/\bhead lice\b/g, " lice "],
  [/\bnap[\s-]?time\b/g, " nap "],
  [/\bearly[\s-]?bird\b/g, " earlybird "],
];

/** Light stemming: enough to match "naps"/"napping", "cancelled"/"cancel", "fees"/"fee". */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  let s = w;
  for (const [suf, rep] of [
    ["ies", "y"],
    ["ing", ""],
    ["led", "l"],
    ["ed", ""],
    ["es", "e"],
    ["s", ""],
  ] as const) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) {
      s = s.slice(0, -suf.length) + rep;
      break;
    }
  }
  // "napping" → "napp" → "nap"; "cancell" → "cancel"
  if (/([b-df-hj-np-tv-z])\1$/.test(s) && !s.endsWith("ll") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.endsWith("ll") && s.length > 5) s = s.slice(0, -1);
  return s;
}

export function tokens(text: string): string[] {
  let t = text.toLowerCase().replace(/[’']/g, "'").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t
    .replace(/'s\b/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

type Field = { weight: number; strong?: boolean; text: (e: HandbookEntry) => string };
const FIELDS: Field[] = [
  { weight: 4, strong: true, text: (e) => e.title },
  { weight: 3.5, strong: true, text: (e) => (e.ask ?? []).join(" . ") },
  { weight: 2.5, strong: true, text: (e) => e.summary },
  { weight: 1, text: (e) => e.body },
  { weight: 0.8, text: (e) => Object.values(e.programs ?? {}).join(" ") },
  { weight: 1, text: (e) => e.chapterTitle },
];

export type HandbookIndex = {
  entries: HandbookEntry[];
  /** Per entry: weighted term frequencies, the words in its title, short answer and example questions, and length. */
  docs: { tf: Map<string, number>; strong: Set<string>; len: number }[];
  df: Map<string, number>;
  avgLen: number;
};

export function buildIndex(entries: HandbookEntry[]): HandbookIndex {
  const docs = entries.map((e) => {
    const tf = new Map<string, number>();
    const strong = new Set<string>();
    let len = 0;
    for (const f of FIELDS) {
      for (const w of tokens(f.text(e))) {
        tf.set(w, (tf.get(w) ?? 0) + f.weight);
        if (f.strong) strong.add(w);
        len += f.weight;
      }
    }
    return { tf, strong, len };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  return { entries, docs, df, avgLen: docs.reduce((n, d) => n + d.len, 0) / Math.max(docs.length, 1) };
}

/** The question's terms, each with the alternatives that also count for it. */
function queryTerms(q: string): { term: string; alts: string[] }[] {
  const seen = new Set<string>();
  const out: { term: string; alts: string[] }[] = [];
  for (const w of tokens(q)) {
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({ term: w, alts: [w, ...(SYNONYMS[w] ?? []).map(stem)] });
  }
  return out;
}

export type HandbookHit = {
  entry: HandbookEntry;
  score: number;
  matched: number;
  /** Does the question's most distinctive word appear in the section's title, short answer or example questions? */
  coreStrong: boolean;
};

export function rank(index: HandbookIndex, q: string, program?: HandbookProgram | null): { hits: HandbookHit[]; terms: number } {
  const terms = queryTerms(q);
  const N = index.docs.length;
  const idfOf = (w: string) => {
    const df = index.df.get(w) ?? 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  };
  // The question's most distinctive word: the one (by itself or a synonym) that's rarest in the handbook.
  const core = terms.length
    ? terms.reduce((a, t) => {
        const score = (x: typeof t) => Math.max(...x.alts.map((w) => (index.df.has(w) ? idfOf(w) : 0)));
        return score(t) > score(a) ? t : a;
      })
    : null;
  const k1 = 1.2;
  const b = 0.6;
  const hits = index.docs.map((d, i) => {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let best = 0;
      t.alts.forEach((w, j) => {
        const f = d.tf.get(w);
        if (!f) return;
        const df = index.df.get(w) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const s = (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / index.avgLen));
        best = Math.max(best, j === 0 ? s : s * 0.7);
      });
      if (best > 0) matched++;
      score += best;
    }
    const e = index.entries[i];
    const coreStrong = !!core && core.alts.some((w) => d.strong.has(w));
    // A gentle nudge toward sections for the family's chosen program; sections for other programs only.
    if (program && e.appliesTo && !e.appliesTo.includes(program)) score *= 0.55;
    if (program && e.programs?.[program]) score *= 1.08;
    return { entry: e, score, matched, coreStrong };
  });
  hits.sort((a, b2) => b2.score - a.score);
  return { hits: hits.filter((h) => h.score > 0), terms: terms.length };
}

export type HandbookAnswer =
  | { found: true; best: HandbookHit; related: HandbookHit[]; excerpt: string[] }
  | { found: false; related: HandbookHit[] };

/** Splits section text into readable passages (paragraphs and list items). */
function passages(e: HandbookEntry, program?: HandbookProgram | null): string[] {
  const out: string[] = [];
  for (const block of e.body.split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (lines.every((l) => /^(- |\d+\. )/.test(l.trim()))) out.push(...lines.map((l) => l.trim()));
    else out.push(lines.join(" "));
  }
  if (program && e.programs?.[program]) out.push(...e.programs[program]!.split(/\n\s*\n/));
  return out;
}

/** The passages of a section that best answer the question (in reading order). */
export function excerpt(e: HandbookEntry, q: string, program?: HandbookProgram | null, max = 2): string[] {
  const terms = queryTerms(q);
  const ps = passages(e, program);
  const scored = ps.map((p, i) => {
    const ws = new Set(tokens(p));
    let s = 0;
    for (const t of terms) if (t.alts.some((w) => ws.has(w))) s += t.alts[0] && ws.has(t.alts[0]) ? 1 : 0.6;
    return { p, i, s };
  });
  const top = scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p);
  return top;
}

/**
 * Answers a question from the handbook, or reports that it isn't covered. A section counts as the
 * answer only when it scores well and covers enough of the question's meaningful words.
 */
export function answer(index: HandbookIndex, q: string, program?: HandbookProgram | null): HandbookAnswer {
  const { hits, terms } = rank(index, q, program);
  if (!terms || !hits.length) return { found: false, related: [] };
  // Prefer the best-scoring section whose title, short answer or example questions use the question's key word.
  const best = hits.slice(0, 4).find((h) => h.coreStrong && h.score >= hits[0].score * 0.6) ?? hits[0];
  const coverage = best.matched / terms;
  const enough = coverage >= 0.5 || (best.matched >= 2 && best.score >= 6);
  if (!best.coreStrong || best.score < 2.5 || !enough) return { found: false, related: hits.slice(0, 3).filter((h) => h.score >= 2) };
  return { found: true, best, related: hits.filter((h) => h !== best && h.score >= best.score * 0.45).slice(0, 3), excerpt: excerpt(best.entry, q, program) };
}
