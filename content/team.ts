/**
 * Team Yalla. Add a photo path (in /public/team/) and a short bio to any person and it will
 * appear automatically on the Team page.
 */
/** The team section on About, the Team page and its footer link stay hidden until this is true. */
export const TEAM_PUBLIC = false;

export type TeamMember = {
  name: string;
  role: string;
  photo?: string | null;
  bio?: string | null;
};

export type TeamGroup = {
  key: string;
  title: string;
  intro?: string;
  /** Cohort illustration used until a photo is added. */
  cohort?: "Seedlings" | "Saplings" | "Sprouts" | "Wildflowers";
  members: TeamMember[];
};

export const team: TeamGroup[] = [
  {
    key: "leadership",
    title: "Leadership",
    members: [
      { name: "Ellie Coburn", role: "Owner & Executive Director" },
      { name: "Natalie Martin", role: "Founding Partner" },
      { name: "Allyson Kirchberg", role: "Founding Partner" },
      { name: "Mariia Sineokova", role: "Creative Director" },
      { name: "Emma Duenas", role: "Director of Operations" },
    ],
  },
  {
    key: "seedlings",
    title: "Seedlings",
    cohort: "Seedlings",
    members: [
      { name: "Angela Chavez", role: "Seedlings Educarer" },
      { name: "Emma Munoz-McCue", role: "Seedlings Educarer" },
    ],
  },
  {
    key: "saplings",
    title: "Saplings",
    cohort: "Saplings",
    members: [
      { name: "Kaeley Kaufold", role: "Saplings Educarer" },
      { name: "Karishma Ali", role: "Saplings Educarer" },
    ],
  },
  {
    key: "sprouts",
    title: "Sprouts",
    cohort: "Sprouts",
    members: [
      { name: "Brenda Puentes", role: "Sprouts Guide" },
      { name: "Gisell Oropeza", role: "Sprouts Guide" },
    ],
  },
  {
    key: "wildflowers",
    title: "Wildflowers",
    cohort: "Wildflowers",
    members: [
      { name: "Natalie Kowal", role: "Wildflowers Guide" },
      { name: "Gloria Hernandez", role: "Wildflowers Guide" },
    ],
  },
];

export const leadership = team.find((g) => g.key === "leadership")!.members;
