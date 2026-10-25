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
    slug: "yalla-everyday",
    kind: "membership",
    name: "Yalla Everyday",
    short: "Fixed weekly care",
    tagline: "Your weekly childcare rhythm",
    summary:
      "Fixed weekly, play-based childcare while you work onsite. Your child builds lasting relationships with their educators and friends, and you get real hours of focus a short walk away.",
    body: [
      "Yalla Everyday is the heart of what we do. Children spend their days playing, exploring, creating and building relationships with the educators who know them well, in classrooms and outdoor spaces made for them.",
      "Parents and caregivers work onsite in our coworking space. You get uninterrupted time for your own work, and you’re close by all day. That closeness is the reason Yalla exists.",
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
    slug: "yalla-flex",
    kind: "drop_in",
    name: "Yalla Flex",
    short: "Drop-in care",
    tagline: "Drop-in childcare",
    summary:
      "Reserve individual days in our classrooms when there’s space. Ideal for flexible schedules, visiting family, or getting to know Yalla.",
    body: [
      "Flex days follow the same thoughtful rhythm as Yalla Everyday, so your child joins a classroom already in full swing.",
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
    slug: "yalla-outside",
    kind: "nature",
    name: "Yalla Outside",
    short: "Nature play school",
    tagline: "Nature playschool in Balboa Park",
    summary:
      "Our nature playschool takes place in Balboa Park, just down the road. Children climb, dig, notice and explore the park through the seasons.",
    body: [
      "Balboa Park is one of the great urban parks, and it’s on our doorstep. Yalla Outside gives children the time and freedom to know it well: its trees and paths, its hidden corners and its changing seasons.",
      "Days outdoors build confidence, curiosity and a deep sense of place, guided by educators who know when to step in and when to let children lead.",
    ],
    image: "/photos/park-lawn.jpg",
    imageAlt: "Open lawn and trees in Balboa Park",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "inquire",
    cta: { label: "Ask about Yalla Outside", href: "/visit" },
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
    image: "/photos/paint-closeup.jpg",
    imageAlt: "A child painting a wall in vivid blues and greens",
    ages: null,
    schedule: null,
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
      "Yalla Weekends bring the calm and creativity of a Yalla weekday to your weekend.",
      "Book single sessions, or set up a repeat booking that comes back every week.",
    ],
    image: "/photos/garden.jpg",
    imageAlt: "Yalla’s leafy yard",
    ages: null,
    schedule: null,
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
    image: "/photos/sunflowers.jpg",
    imageAlt: "Sunflowers and scissors on a table set for a workshop",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "instant",
    cta: { label: "See upcoming Happenings", href: "/book?offering=happening" },
  },
  {
    slug: "yalla-after-hours",
    kind: "parents_night",
    name: "Yalla After Hours",
    short: "Parents’ night out",
    tagline: "Their evening of play. Your night out.",
    summary:
      "Evenings when the children have their own night at Yalla, with familiar faces and a cosy evening rhythm, while you have yours.",
    body: [
      "Yalla After Hours turns Yalla into an evening of slow play with the educators your children already know.",
      "Spaces are limited for each evening and open in the booking calendar ahead of time.",
    ],
    image: "/photos/cowork-loft.jpg",
    imageAlt: "Warm pendant lights glowing over the Yalla interior",
    ages: null,
    schedule: null,
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
      "Celebrate a birthday or special occasion at Yalla. Tell us what you have in mind and we’ll help you shape the day.",
    body: [
      "Our rooms and yard were made for small people having a wonderful time, which makes them a beautiful setting for a celebration.",
      "Every Celebration is planned with you. Share your date, your guest list and your ideas, and we’ll take it from there.",
    ],
    image: "/photos/painting.jpg",
    imageAlt: "Bright paint and brushes on a party table",
    ages: null,
    schedule: null,
    pricing: null,
    included: null,
    parentOnsite: null,
    bookingMode: "inquire",
    cta: { label: "Plan a celebration", href: "/visit" },
  },
];

export const getProgram = (slug: string) => programs.find((p) => p.slug === slug);
export const programByKind = (kind: ProgramKind) => programs.find((p) => p.kind === kind)!;
