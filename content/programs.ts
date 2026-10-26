import type { BookingMode, ProgramKind } from "@/lib/booking/types";

/**
 * Program content. Fields set to null are not yet confirmed by Yalla and render
 * with a "to confirm" marker rather than invented detail.
 */
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
  ages: string | null;
  days: string | null;
  pricing: string | null;
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
    ages: "3 months – 5 years. See each age group with the day rates below.",
    days: "Monday – Friday. Full days 8:30am – 4:30pm or half days 8:30am – 12:00pm, when there’s space",
    pricing: "$150–$180 a full day or $75–$90 a half day for childcare and coworking, depending on your child’s age. No registration fee. See day rates below.",
    included: ["Childcare in a play environment with similarly aged peers and attentive educarers and guides", "Communal coworking for you, for the same day"],
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
      "Themed weeks for little ones, planned with the same care as every Yalla day: unhurried, hands-on and full of discovery.",
    body: [
      "Each camp is built around an idea children can explore with their hands: making, building, growing, getting messy and discovering.",
      "Camps book as a set of days, so your child keeps the same friends and educators all week.",
    ],
    image: "/photos/painting-table.jpg",
    imageAlt: "A toddler painting with brushes and bright colors outdoors",
    ages: null,
    days: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "View camp dates", href: "/book?offering=camp" },
  },
  {
    slug: "yalla-weekends",
    kind: "weekend",
    name: "Yalla Weekends",
    short: "Weekend care",
    tagline: "A little room in your weekend",
    summary:
      "Weekend sessions for when you need a few hours for work, errands or simply yourself, while your child has a weekend of their own.",
    body: [
      "Yalla Weekends bring Yalla’s calm and creativity to your weekend.",
      "Book single sessions, or set up a repeat booking that comes back every week.",
    ],
    image: "/photos/rainbow-light.jpg",
    imageAlt: "A toddler standing in rainbow light on a wooden floor",
    ages: null,
    days: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "See weekend sessions", href: "/book?offering=weekend" },
  },
  {
    slug: "yalla-happenings",
    kind: "happening",
    name: "Yalla Happenings",
    short: "Pop-up events",
    tagline: "Pop-ups, workshops & community gatherings",
    summary:
      "A changing calendar of pop-ups, workshops and gatherings that bring the Yalla community together.",
    body: [
      "Yalla is a community as much as a place. Happenings are how we gather: small, thoughtful events that make family life feel a little less solitary.",
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
    short: "Fixed weekly care",
    tagline: "Your weekly childcare rhythm",
    summary:
      "Club Yalla is our weekday membership for parents who work remotely, offering dedicated coworking spaces with high-quality childcare onsite. Settle into your work alongside other parents while your child spends their days playing, creating, and exploring in a small cohort with familiar, attentive caregivers. With consistent days each week, you both have the opportunity to build friendships and feel at home—all under one roof.",
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
  {
    slug: "yalla-after-hours",
    kind: "parents_night",
    name: "Yalla After Hours",
    short: "Parents’ night out",
    tagline: "Their evening of play. Your night out.",
    summary:
      "Evenings when the children have their own night at Yalla, with familiar faces and a cozy evening rhythm, while you have yours.",
    body: [
      "Yalla After Hours turns Yalla into an evening of slow play with the educators your children already know.",
      "Spaces are limited for each evening and open in the booking calendar ahead of time.",
    ],
    image: "/photos/tulle.jpg",
    imageAlt: "A child playing with embroidered tulle in soft evening light",
    ages: null,
    days: null,
    pricing: null,
    included: null,
    parentOnsite: false,
    bookingMode: "instant",
    cta: { label: "Book an evening", href: "/book?offering=parents_night" },
  },
  {
    slug: "yalla-celebrations",
    kind: "private_event",
    name: "Yalla Celebrations",
    short: "Private events",
    tagline: "Private parties & special occasions",
    summary:
      "Host a private party or special occasion at Yalla. Tell us what you have in mind and we’ll help you shape it.",
    body: [
      "Yalla is a beautiful setting for a gathering: thoughtfully designed rooms, a leafy yard and a historic corner of Bankers Hill.",
      "Every private event is planned with you. Share your date, your guest count and your ideas, and we’ll be in touch to plan the details.",
    ],
    image: "/photos/painting.jpg",
    imageAlt: "Bright paint and brushes on a party table",
    ages: null,
    days: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "inquire",
    cta: { label: "Enquire about a private event", href: "/programs/yalla-celebrations#enquire" },
  },
];

export const getProgram = (slug: string) => programs.find((p) => p.slug === slug);

/** Club Yalla has its own top-level page; every other program lives under /programs. */
export const clubYalla = programs.find((p) => p.kind === "membership")!;
export const otherPrograms = programs.filter((p) => p.kind !== "membership");
export const programHref = (p: Pick<ProgramContent, "kind" | "slug">) => (p.kind === "membership" ? "/club-yalla" : `/programs/${p.slug}`);
export const programByKind = (kind: ProgramKind) => programs.find((p) => p.kind === kind)!;
