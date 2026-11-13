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
  /** Weekday cohort hours (Club Yalla and Yalla Flex). Other programs list their own times. */
  hours: "Weekdays, 8:30am – 4:30pm",
  extendedCare: "Early Bird care from 8:00am",
  yearRound: true,
  email: { value: "hello@yallaspacesd.com", confirm: false },
  address: { value: "408 Nutmeg Street, San Diego, CA 92103" as string | null, confirm: false },
  phone: { value: "619.775.4008" as string | null, confirm: false },
  instagram: { value: "https://www.instagram.com/yallachildcare/", confirm: false },
  pinterest: { value: "https://www.pinterest.com/yallachildcare/", confirm: false },
  amazon: { value: "https://www.amazon.com/shop/yallachildcare", confirm: false },
};

export const nav = [
  { href: "/experience", label: "The Yalla Experience", short: "Experience" },
  { href: "/club-yalla", label: "Club Yalla", short: "Club Yalla" },
  { href: "/programs", label: "Programs", short: "Programs" },
  { href: "/about", label: "About Yalla", short: "About" },
] as const;

export const secondaryNav = [
  { href: "/faq", label: "FAQ" },
  { href: "/book", label: "Book Care" },
  { href: "/portal", label: "Family Portal" },
] as const;
