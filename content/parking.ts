// Parking guide for Yalla families, shown in the Family Portal (signed-in families only).
// Source: "Parking Guide for Yalla Families" PDF supplied by Yalla.

const YALLA = "408 Nutmeg St, San Diego, CA 92103";
const walkTo = (from: string) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(YALLA)}&travelmode=walking`;

export const parkingAddress = YALLA;

export const parkingIntro =
  "Yalla is fortunate to call the historic Bankers Hill home. While parking in the neighborhood can be limited at times, we’ve put thoughtful options in place to help families plan ahead and park their personal vehicles with confidence whenever they visit Yalla.";

export const parkingOptions = [
  { id: "park-and-walk", title: "Park and walk", price: "Free with tuition" },
  { id: "metered", title: "Paid metered parking", price: "$5 for 2 hours" },
  { id: "monthly", title: "Discounted monthly lots", price: "$90 a month" },
  { id: "apps", title: "App-based parking", price: "Cost varies" },
  { id: "driveway", title: "Yalla driveway policy", price: "Reserved" },
];

export const balboaLots = [
  { name: "Marston Point Lot", free: true, walk: "0.6 miles · 11–13 minute walk", href: walkTo("32.726966,-117.1577253") },
  { name: "Alcazar Lot", free: false, walk: "0.7 miles · 13–16 minute walk", href: walkTo("32.7305191,-117.1519348") },
  { name: "Organ Pavilion Lot", free: false, walk: "0.9 miles · 15–20 minute walk", href: walkTo("32.7286281,-117.1512915") },
  { name: "Pan American Plaza Parking Lot (Palisades)", free: true, walk: "1.0 miles · 17–21 minute walk", href: walkTo("32.7279279,-117.1527614") },
];

export const balboaPassesHref = "https://www.sandiego.gov/parking/balboapark";
export const parkSmarterHref = "https://www.sandiego.gov/blog/pay-using-your-phone-any-meter-displaying-blue-park-smarter-sticker-download-park-smarter-app";

export const monthlyLots = [
  { name: "Olive Avenue", walk: "2 minute walk", address: "525 Olive Ave, San Diego, CA 92103", billed: "Through the Family Portal on the last day of each month" },
  { name: "Park West Lot", walk: "5 minute walk", address: "2550 Fifth Ave, San Diego, CA 92103", billed: "Through the Family Portal on the last day of each month" },
];

/**
 * Parking apps. On iPhone the App Store link opens, on Android the Google Play link, and on a
 * computer the website. Parkopedia retired its app on July 1, 2026 (its App Store listing says
 * its services moved to its website), so it always opens the website.
 */
export const parkingApps: { name: string; web: string; ios?: string; android?: string }[] = [
  { name: "Parkopedia", web: "https://www.parkopedia.com" },
  {
    name: "SpotHero",
    web: "https://spothero.com",
    ios: "https://apps.apple.com/us/app/spothero-1-rated-parking-app/id499097243",
    android: "https://play.google.com/store/apps/details?id=com.spothero.spothero",
  },
  {
    name: "ParkMobile",
    web: "https://parkmobile.io",
    ios: "https://apps.apple.com/us/app/parkmobile-park-pay-go/id365399299",
    android: "https://play.google.com/store/apps/details?id=net.sharewire.parkmobilev2",
  },
];
