import type { MarkName } from "@/components/brand/marks";
import type { BookingMode, ProgramKind } from "@/lib/booking/types";

/**
 * Program content. Fields set to null are not yet confirmed by Yalla and render
 * with a "to confirm" marker rather than invented detail.
 */
export interface FactBlock {
  lead?: string;
  rows: { label: string; value?: string }[];
  note?: string;
}

const groups = (middle = "4 – 6 years"): FactBlock[] => [
  { rows: [{ label: "18 months – 4 years" }, { label: middle }, { label: "7 – 10 years" }] },
];

/** Camp Yalla's confirmed 2026–27 camp days (the camp page shows live availability for these when it can). */
export const CAMP_DAYS = ["2026-11-11", "2026-11-25", "2026-12-21", "2026-12-22", "2026-12-23", "2026-12-28", "2026-12-29", "2026-12-30", "2027-01-18", "2027-02-15", "2027-07-05"];

export interface ProgramContent {
  slug: string;
  kind: ProgramKind;
  name: string;
  short: string;
  tagline: string;
  summary: string;
  body: string[];
  image: string;
  imageAlt: string;
  /** A hand-drawn motif that accompanies the program across the site. */
  motif?: MarkName;
  ages: string | null;
  days: string | null;
  pricing: string | null;
  /** Optional at-a-glance versions of ages, days and pricing, shown as tidy rows on the program page. */
  facts?: { ages?: FactBlock[]; days?: FactBlock[]; pricing?: FactBlock[] };
  included: string[] | null;
  parentOnsite: boolean | null;
  bookingMode: BookingMode;
  cta: { label: string; href: string };
}

export const programs: ProgramContent[] = [
  {
    slug: "yalla-flex",
    kind: "drop_in",
    name: "Yalla Flex",
    short: "Drop-in childcare & coworking",
    tagline: "Childcare and coworking by the day, Monday to Friday",
    summary:
      "Book individual weekdays, Monday through Friday, when there’s space: a day of childcare for your child in one of our thoughtfully designed play environments and a day of coworking for you, all under one roof. Ideal for flexible schedules, families visiting San Diego, or simply getting to know Yalla.",
    body: [
      "Yalla Flex is drop-in childcare and coworking for families who need care here and there rather than a regular membership. On the days you book, your child spends the day in a play environment with similarly aged peers and attentive educarers and guides, while you settle into our coworking space a few steps away.",
      "See live availability, choose your days and reserve in a few taps. Your bookings stay in the Family Portal, where you can manage or change them.",
    ],
    image: "/photos/lemon-play.jpg",
    imageAlt: "A child's hand scooping lemon slices from a water table",
    motif: "waves",
    ages: "3 months – 5 years. See each age group with the day rates below.",
    days: "Monday – Friday. Full days 8:30am – 4:30pm or half days 8:30am – 12:00pm, when there’s space",
    pricing: "$150–$180 a full day or $75–$90 a half day for childcare and coworking, depending on your child’s age. No registration fee. See day rates below.",
    included: ["Childcare in a play environment with similarly aged peers and attentive educarers and guides", "Communal coworking for you"],
    parentOnsite: true,
    bookingMode: "instant",
    cta: { label: "See available days", href: "/book?offering=drop_in" },
  },
  {
    slug: "camp-yalla",
    kind: "camp",
    name: "Camp Yalla",
    short: "Camps",
    tagline: "Seasonal adventures for children",
    summary:
      "Camp days for children 18 months to 10 years, planned with the same care as every Yalla day: unhurried, hands-on and full of discovery.",
    body: [
      "Each camp is built around an idea children can explore with their hands: making, building, growing, getting messy and discovering.",
      "Book the days that suit your family. Children spend the day with others close to their age, in three groups: 18 months to 4 years, 4 to 6 years, and 7 to 10 years.",
    ],
    image: "/photos/painting-table.jpg",
    imageAlt: "A toddler painting with brushes and bright colors outdoors",
    motif: "sprig",
    ages: "18 months – 10 years, in three age groups: 18 months – 4 years, 4 – 6 years, and 7 – 10 years",
    days: "9:00am – 3:00pm. 2026–27 camp days: November 11 and 25; December 21, 22, 23, 28, 29 and 30; January 18; February 15; July 5",
    pricing: "$160 per child per day. Optional extras: Early Bird from 8:00am, $20, and a late stay from 3:00 to 4:30pm, $30, per child per day.",
    facts: {
      ages: groups(),
      days: [
        {
          rows: [
            { label: "Camp day", value: "9:00am – 3:00pm" },
            { label: "Early Bird", value: "8:00 – 9:00am" },
            { label: "Late stay", value: "3:00 – 4:30pm" },
          ],
        },
        {
          lead: "2026–27 camp days",
          rows: [
            { label: "November", value: "11, 25" },
            { label: "December", value: "21, 22, 23, 28, 29, 30" },
            { label: "January", value: "18" },
            { label: "February", value: "15" },
            { label: "July", value: "5" },
          ],
        },
      ],
      pricing: [
        {
          lead: "Per child, per day",
          rows: [
            { label: "Camp day", value: "$160" },
            { label: "Early Bird (optional)", value: "$20" },
            { label: "Late stay (optional)", value: "$30" },
          ],
        },
      ],
    },
    included: null,
    parentOnsite: false,
    bookingMode: "instant",
    cta: { label: "View camp dates", href: "/book?offering=camp" },
  },
  {
    slug: "yalla-happenings",
    kind: "happening",
    name: "Yalla Happenings",
    short: "Pop-up events",
    tagline: "Play, gatherings and more, all in one calendar",
    summary:
      "Immersive Play, weekend play, After Hours evenings, pop-ups, workshops and gatherings that bring the Yalla community together, all in one calendar.",
    body: [
      "Yalla is a community as much as a place. Happenings are how we gather: small, thoughtful events that make family life feel a little less solitary.",
      "Immersive Play Sessions, 9:00am to 12:00pm for children 3 to 8 years, are three-hour blocks to settle in, follow their curiosity and go deep in their play. Weekend Play Sessions give children 18 months to 10 years a morning or afternoon of play with others their age.",
      "Upcoming Happenings appear in the booking calendar, where you can reserve a place.",
    ],
    image: "/photos/paint-wall.jpg",
    imageAlt: "An outdoor painting wall with paint pots on a wooden ledge",
    ages: null,
    days: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "See upcoming Happenings", href: "/book?offering=happening" },
  },
  {
    slug: "club-yalla",
    kind: "membership",
    name: "Club Yalla",
    short: "Weekday membership",
    tagline: "Rethinking childcare for the work-from-anywhere generation.",
    summary:
      "Club Yalla is our year-round weekday membership program for parents who work remotely, offering dedicated coworking spaces with high-quality childcare onsite. Settle into your work alongside other parents while your child spends their days playing, creating, and exploring in a small cohort with familiar, attentive caregivers. With consistent days each week, you both have the opportunity to build friendships and feel at home—all under one roof.",
    body: [
      "Club Yalla is our recurring weekday membership. Children spend their days playing, exploring, creating and building relationships with the educators who know them well, in cohort spaces and outdoor environments made for them.",
      "Parents and caregivers work onsite in our coworking space. You get uninterrupted time for your own work, and you’re close by all day. That closeness is what Club Yalla is built around.",
    ],
    image: "/photos/dinosaurs.jpg",
    imageAlt: "A young child arranging toy dinosaurs on a small wooden table outdoors",
    ages: "4 months – 5 years",
    days: "Weekdays, year-round. Full days 8:30am – 4:30pm or half days 8:30am – 12:00pm, one to five days a week. Early Bird care from 8:00am.",
    pricing: "From $275 a month, depending on cohort and number of days. See membership rates for full tuition.",
    included: [
      "Onsite childcare rooted in the Reggio Emilia and RIE approaches",
      "Credentialed early childhood educators",
      "Communal coworking, high-speed internet, coffee, tea and light snacks",
      "Coworking kitchen and unlimited color printing",
    ],
    parentOnsite: true,
    bookingMode: "enroll",
    cta: { label: "Apply for membership", href: "/apply" },
  },
];

export const getProgram = (slug: string) => programs.find((p) => p.slug === slug);

/** Club Yalla has its own top-level page; every other program lives under /programs. */
export const clubYalla = programs.find((p) => p.kind === "membership")!;
export const otherPrograms = programs.filter((p) => p.kind !== "membership");
export const programHref = (p: Pick<ProgramContent, "kind" | "slug">) => (p.kind === "membership" ? "/club-yalla" : `/programs/${p.slug}`);
export const programByKind = (kind: ProgramKind) => programs.find((p) => p.kind === kind)!;
