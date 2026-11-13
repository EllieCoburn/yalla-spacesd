export type QA = { q: string; a: string[] };

export type HappeningType = "immersive" | "weekend" | "evening" | "more";

/**
 * The kinds of Yalla Happenings. One color each, used everywhere a Happening appears (legend,
 * calendar, selection and descriptions) so families can always tell what they're booking.
 * Class names are written out in full so Tailwind keeps them.
 */
export const HAPPENING_TYPES: {
  key: HappeningType;
  name: string;
  short: string;
  /** Solid swatch, tint for a calendar entry, and the selected entry. */
  dot: string;
  tint: string;
  solid: string;
  body: string;
  facts: { label: string; value: string }[];
  notes: string[];
}[] = [
  {
    key: "immersive",
    name: "Immersive Play Sessions",
    short: "Immersive Play",
    dot: "bg-blue",
    tint: "bg-blue/10 border-blue/30 hover:border-blue",
    solid: "bg-blue border-blue text-chalk",
    body: "Our Immersive Play Sessions offer three-hour blocks for children to settle in, follow their curiosity, and go deep in their play. Thoughtfully prepared play landscapes invite them to build, imagine, experiment, and take their ideas in unexpected directions. Guides stay close to offer gentle redirection, help navigate social-emotional conflicts, and support as needed, while giving children space to lead.",
    facts: [
      { label: "Ages", value: "3 – 8 years" },
      { label: "Hours", value: "9:00am – 12:00pm" },
      { label: "Price", value: "$45 per child" },
    ],
    notes: [
      "Staying while they play? Add coworking for you, +$15 per session, when you book.",
      "Lunch together at 11:30am, packed from home. Departure at 12:00pm.",
    ],
  },
  {
    key: "weekend",
    name: "Weekend Play Sessions",
    short: "Weekend Play",
    dot: "bg-oxblood",
    tint: "bg-oxblood/10 border-oxblood/30 hover:border-oxblood",
    solid: "bg-oxblood border-oxblood text-chalk",
    body: "A morning or afternoon of play for your child while you work, run errands or simply rest. Children spend the session in a separate group with others close to their own age, each with plans suited to them.",
    facts: [
      { label: "Ages", value: "18 months – 10 years" },
      { label: "Hours", value: "9:00am – 12:00pm or 1:00 – 4:00pm" },
      { label: "Price", value: "$60 per child" },
    ],
    notes: ["Separate age groups: 18 months – 4 years, 4 – 7 years, and 7 – 10 years."],
  },
  {
    key: "evening",
    name: "After Hours Evenings",
    short: "After Hours",
    dot: "bg-ink",
    tint: "bg-ink/[0.07] border-ink/25 hover:border-ink",
    solid: "bg-ink border-ink text-chalk",
    body: "An evening of play for them, a night out for you. For children 18 months to 10 years, each spending the evening in a separate group with others their own age.",
    facts: [
      { label: "Ages", value: "18 months – 10 years" },
      { label: "Hours", value: "5:00 – 9:00pm" },
      { label: "Price", value: "$65 per child" },
    ],
    notes: [
      "Siblings: $85 for up to three children, +$25 for each additional child, applied automatically.",
      "Separate age groups: 18 months – 4 years, 4 – 6 years, and 7 – 10 years.",
    ],
  },
  {
    key: "more",
    name: "Pop-ups & gatherings",
    short: "Pop-ups",
    dot: "bg-stone",
    tint: "bg-stone/30 border-stone hover:border-ink/40",
    solid: "bg-stone border-stone text-ink",
    body: "Workshops, seasonal events and community gatherings that make family life feel a little less solitary.",
    facts: [],
    notes: ["Times, ages and prices are listed with each event."],
  },
];

