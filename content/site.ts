/**
 * Facts about Yalla used across the site. Anything still marked `confirm: true`
 * is shown on the site with a small "to confirm" marker until Yalla signs off.
 */
export const site = {
  name: "Yalla",
  fullName: "Yalla Childcare & Coworking",
  neighborhood: "Bankers Hill",
  city: "San Diego",
  locationLine: "Historic Bankers Hill, near Balboa Park’s west entrance",
  ages: "4 months – 5 years",
  hours: "Weekdays, 8:30am – 4:30pm",
  extendedCare: "Optional extended care",
  yearRound: true,
  email: { value: "hello@yallaspacesd.com", confirm: false },
  address: { value: null as string | null, confirm: true },
  phone: { value: null as string | null, confirm: true },
  instagram: { value: "https://www.instagram.com/yallachildcare/", confirm: false },
  pinterest: { value: "https://www.pinterest.com/yallachildcare/", confirm: false },
};

export const nav = [
  { href: "/experience", label: "The Yalla Experience", short: "Experience" },
  { href: "/spaces", label: "Our Spaces", short: "Spaces" },
  { href: "/programs", label: "Programs", short: "Programs" },
  { href: "/membership", label: "Membership & Tuition", short: "Membership" },
  { href: "/about", label: "About Yalla", short: "About" },
  { href: "/visit", label: "Visit Yalla", short: "Visit" },
] as const;

export const secondaryNav = [
  { href: "/faq", label: "FAQ" },
  { href: "/book", label: "Book Care" },
  { href: "/portal", label: "Family Portal" },
] as const;
