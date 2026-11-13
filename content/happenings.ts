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

/** Questions families ask about Immersive Play Sessions (wording from Yalla). */
export const IMMERSIVE_FAQ: QA[] = [
  {
    q: "What is deep play?",
    a: [
      "Deep play is a state of sustained, absorbed play in which children follow their curiosity and become immersed in their own ideas. Blocks become a bustling city, a piece of fabric becomes an ocean, and an imaginary adventure unfolds between friends. Given time and freedom, children build on these ideas, solve problems, navigate relationships, and explore new possibilities. Adults remain available for support while allowing children to lead. The magic comes from having space to wonder, create, and see where their imagination takes them.",
    ],
  },
  {
    q: "What is the value of an Immersive Play Session?",
    a: [
      "In a world of screens, busy schedules, and frequent interruptions, time for deep play can be fleeting. Shared spaces where children can explore freely and let their ideas grow together can be difficult to find. This kind of play needs time, an inviting environment, and the freedom to follow an idea without being hurried to the next activity.",
      "Our three-hour Immersive Play Sessions protect that space. Thoughtfully prepared play landscapes invite creativity, collaboration, and discovery, while attentive guides offer support and help children navigate social-emotional challenges without taking over their play. Children have time to build friendships, work through problems, and experience the magic of bringing their own ideas to life.",
      "For parents, whose free time is often limited, these sessions offer room to focus on work, take a workout class, or simply recharge, knowing their children are enjoying meaningful connection and the freedom to become deeply absorbed in play.",
    ],
  },
  {
    q: "Why do Immersive Play Sessions welcome a mixed-age group?",
    a: [
      "Early childhood extends through age eight, encompassing a rich period of imagination, discovery, and learning through play. While children across these ages have different abilities and needs, they often share a curiosity about one another and enjoy opportunities to play and learn together.",
      "Younger children find inspiration in older children’s ideas, language, and approaches to challenges. Older children have opportunities to practice patience, empathy, and leadership, while rediscovering the delight of a younger child’s perspective. Each child can contribute something meaningful, and learning flows in both directions.",
      "With most groups and activities separated by age, these connections can be hard to find outside sibling relationships. Our mixed-age sessions make room for them. Open-ended play landscapes offer different ways to engage, and guides support children in finding playmates, maintaining boundaries, and participating at their own pace. Children can connect through shared interests, with room to be both a learner and someone another child learns from.",
    ],
  },
  {
    q: "What should my child bring?",
    a: [
      "Please send your child with a labeled water bottle, lunch box, light jacket, and one spare outfit. Label all belongings so we can help them find their way home.",
      "Dress your child in comfortable clothes that can get messy! Mud, water, paint, and other hands-on materials are often part of our play, and we want children to feel free to explore without worrying about their clothes.",
    ],
  },
];
