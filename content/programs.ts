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
  schedule: string | null;
  pricing: string | null;
  included: string[] | null;
  parentOnsite: boolean | null;
  bookingMode: BookingMode;
  cta: { label: string; href: string };
}

export const programs: ProgramContent[] = [
  {
    slug: "the-yalla-day",
    kind: "membership",
    name: "The Yalla Day",
    short: "Ongoing childcare",
    tagline: "Our everyday rhythm, year-round.",
    summary:
      "Ongoing, play-based childcare on weekdays while you work onsite. Your child builds lasting relationships with their educators and friends; you have real hours of focus, a short walk away.",
    body: [
      "The Yalla Day is the heart of what we do. Children spend their days playing, exploring, creating and building relationships with the educators who know them well, in classrooms and outdoor spaces made for them.",
      "Parents and caregivers work onsite in our coworking space. You get uninterrupted time for your own work, and you're close by all day. That closeness is the reason Yalla exists.",
    ],
    image: "/photos/dinosaurs.jpg",
    imageAlt: "A young child arranging toy dinosaurs on a small wooden table outdoors",
    ages: "4 months – 5 years",
    schedule: "Weekdays, 8:30am – 4:30pm, year-round, with optional extended care",
    pricing: null,
    included: null,
    parentOnsite: true,
    bookingMode: "enroll",
    cta: { label: "Membership & tuition", href: "/membership" },
  },
  {
    slug: "drop-in-care",
    kind: "drop_in",
    name: "Drop-in Care",
    short: "Drop-in care",
    tagline: "A Yalla day, whenever you need one.",
    summary:
      "Reserve individual days in our classrooms when there's space. It's ideal for flexible schedules, visiting family, or getting to know Yalla before you enroll.",
    body: [
      "Drop-in days follow the same thoughtful rhythm as our ongoing program, so your child joins a classroom already in full swing.",
      "See live availability, choose your days and reserve in a few taps. Your bookings stay in the Family Portal, where you can manage or change them.",
    ],
    image: "/photos/lemon-play.jpg",
    imageAlt: "A child's hand scooping lemon slices from a water table",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "See available days", href: "/book?offering=drop_in" },
  },
  {
    slug: "camps",
    kind: "camp",
    name: "Camps",
    short: "Camps",
    tagline: "Seasonal weeks, each with a story.",
    summary:
      "Themed weeks for little ones, planned with the same care as every Yalla day: unhurried, hands-on and full of discovery.",
    body: [
      "Each camp is built around an idea children can explore with their hands: making, building, growing, getting messy and discovering.",
      "Camps book as a set of days, so your child keeps the same friends and educators all week.",
    ],
    image: "/photos/painting.jpg",
    imageAlt: "Small hands painting with bright colours on a paper plate",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "View camp dates", href: "/book?offering=camp" },
  },
  {
    slug: "parents-night-out",
    kind: "parents_night",
    name: "Parents’ Night Out",
    short: "Parents’ night out",
    tagline: "Go to dinner. We’ve got the evening.",
    summary:
      "Evenings when the children have their own night at Yalla, with familiar faces and a cosy evening rhythm, while you have yours.",
    body: [
      "Parents’ Night Out turns Yalla into an evening of slow play and wind-down rituals with the educators your children already know.",
      "Spaces are limited for each evening and open in the booking calendar ahead of time.",
    ],
    image: "/photos/sunflowers.jpg",
    imageAlt: "Sunflowers and scissors on a table set for an activity",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: false,
    bookingMode: "instant",
    cta: { label: "Book an evening", href: "/book?offering=parents_night" },
  },
  {
    slug: "weekend-care",
    kind: "weekend",
    name: "Weekend Care",
    short: "Weekend care",
    tagline: "Weekends, made a little lighter.",
    summary:
      "Weekend sessions and enrichment for when you need a few hours for work, errands or just yourself.",
    body: [
      "Weekend sessions bring the calm and creativity of a Yalla weekday to your weekend.",
      "Book single sessions, or set up a repeat booking that comes back every week.",
    ],
    image: "/photos/garden.jpg",
    imageAlt: "Yalla's leafy outdoor yard with trees and a wooden fence",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "See weekend sessions", href: "/book?offering=weekend" },
  },
];

export const getProgram = (slug: string) => programs.find((p) => p.slug === slug);
export const programByKind = (kind: ProgramKind) => programs.find((p) => p.kind === kind)!;
