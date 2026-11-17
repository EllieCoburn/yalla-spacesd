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

const groups = (middle = "4 – 7 years"): FactBlock[] => [
  { rows: [{ label: "18 months – 3 years" }, { label: middle }, { label: "8 – 10 years" }] },
];


export interface ProgramContent {
  slug: string;
  kind: ProgramKind;
  name: string;
  short: string;
  tagline: string;
  /** An optional short line shown above the summary on the Programs page. */
  summaryLead?: string;
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
    summaryLead: "A day of play for your child. A productive day for you. All under one roof.",
    summary:
      "Yalla Flex pairs childcare in thoughtfully designed play spaces with dedicated coworking for parents. Book individual sessions Monday through Friday, with full days from 8:30am–4:30pm or half days from 8:30am–12:00pm, subject to availability in our age-based groups. Ideal for flexible schedules, visits to San Diego, or getting to know Yalla.",
    body: [
      "Yalla Flex is drop-in childcare and coworking for families who need care here and there rather than a regular membership. On the days you book, your child spends the day in a play environment with similarly aged peers and attentive educarers and guides, while you settle into our coworking space a few steps away.",
      "See live availability, choose your days and reserve in a few taps. Your bookings stay in the Family Portal, where you can manage or change them.",
    ],
    image: "/photos/flex-roller-painting.jpg",
    imageAlt: "A toddler painting a large sheet of paper on a fence with a blue paint roller, while another child dips a roller in a tray",
    motif: "waves",
    ages: "4 months – 4 years, in four age groups: 4 – 12 months, 12 – 20 months, 20 – 35 months and 3 – 4 years. See the day rates below.",
    days: "Monday – Friday, when a spot opens for your child’s age group. Full days 8:30am – 4:30pm or half days 8:30am – 12:00pm",
    pricing: "$150–$180 a full day or $75–$90 a half day for childcare and coworking, depending on your child’s age. No registration fee. Siblings: 10% off each additional child on the same day, applied automatically. See day rates below.",
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
      "Book the days that suit your family. Children spend the day with others close to their age, in three groups: 18 months to 3 years, 4 to 7 years, and 8 to 10 years.",
    ],
    image: "/photos/painting-table.jpg",
    imageAlt: "A toddler painting with brushes and bright colors outdoors",
    motif: "sprig",
    ages: "18 months – 10 years, in three age groups: 18 months – 3 years, 4 – 7 years, and 8 – 10 years",
    days: "9:00am – 3:00pm. New camp days are added to the calendar throughout the year.",
    pricing: "$160 per child per day. Optional extras: Early Bird from 8:00am, $20, and a late stay from 3:00 to 4:30pm, $30, per child per day. Siblings: 10% off each additional child on the same day, applied automatically. Includes a morning snack and a light afternoon snack; families pack lunch.",
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
          lead: "Camp days",
          rows: [{ label: "Dates", value: "Added to the calendar throughout the year" }],
        },
      ],
      pricing: [
        {
          lead: "Per child, per day",
          rows: [
            { label: "Camp day", value: "$160" },
            { label: "Early Bird (optional)", value: "$20" },
            { label: "Late stay (optional)", value: "$30" },
            { label: "Siblings", value: "10% off each additional child" },
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
