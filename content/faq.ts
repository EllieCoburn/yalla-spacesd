/**
 * Yalla's FAQs: one entry per question, shown on the FAQ page and on any page it's tagged for.
 *
 * This file holds the starting content. Staff can edit any entry, add new ones, reorder, retag or
 * hide them in Admin → FAQs; a saved edit replaces the entry here with the same id, everywhere.
 *
 * Answers use a little formatting: a blank line starts a new paragraph, lines starting "- " make a
 * list, [words](/link) makes a link and **words** are bold. An entry with `policy` shows that
 * approved policy's wording (content/policies.ts) instead of its own answer, so a policy is only
 * ever written once.
 *
 * Drafts never appear on the site. Answers Yalla hasn't confirmed stay drafts, with `needs`
 * saying what's missing, until Yalla provides the information.
 */

export const FAQ_CATEGORIES = [
  { key: "getting-started", label: "Getting Started", description: "Exploring Yalla, accounts, tours, and reservations." },
  { key: "club-yalla", label: "Club Yalla", description: "Weekday childcare and coworking memberships." },
  { key: "play-pass", label: "Play Pass", description: "Membership benefits, session access, and reservations." },
  { key: "bookings", label: "Bookings & Happenings", description: "Flex care, camps, weekend sessions, and special events." },
  { key: "billing", label: "Billing & Policies", description: "Payments, credits, cancellations, and membership policies." },
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number]["key"];

/** Pages that show a short set of FAQs ("A few good questions."). */
export const FAQ_PAGES = [
  { key: "club-yalla", label: "Club Yalla page", category: "club-yalla" },
  { key: "play-pass", label: "Play Pass page", category: "play-pass" },
  { key: "flex", label: "Yalla Flex page", category: "bookings" },
  { key: "camp", label: "Camp Yalla page", category: "bookings" },
  { key: "happenings", label: "Yalla Happenings page", category: "bookings" },
  { key: "immersive", label: "Immersive Play (on the Happenings page)", category: "bookings" },
] as const;

export type FaqPage = (typeof FAQ_PAGES)[number]["key"];

export type FaqStatus = "published" | "draft" | "archived";

export type Faq = {
  id: string;
  question: string;
  answer: string;
  /** Approved policy shown as the answer (content/policies.ts). */
  policy?: string;
  category: FaqCategory;
  /** Other FAQ-page categories the same entry also appears in. */
  alsoIn?: FaqCategory[];
  /** Pages it appears on, with its position there. */
  pages?: Partial<Record<FaqPage, number>>;
  /** Position within its category. */
  order: number;
  status: FaqStatus;
  /** For drafts: what Yalla needs to confirm before it can be published. */
  needs?: string;
};

const POLICY_LINK = "[cancellation and refund policy](/faq?q=cancellation-refund-policy)";

export const DEFAULT_FAQS: Faq[] = [
  /* ── Getting Started ── */
  {
    id: "what-is-yalla",
    category: "getting-started",
    order: 10,
    status: "published",
    question: "What is Yalla?",
    answer:
      "Yalla is a place in San Diego’s Bankers Hill where the needs of children and parents shape the same space. Children have room to move, experiment, revisit a discovery, and build relationships with familiar caregivers. Parents have somewhere comfortable to work, and other adults with whom to share the ordinary texture of a day.\n\nFamilies join in the way that suits them: weekly childcare and coworking with [Club Yalla](/club-yalla), [Flex days](/programs/yalla-flex) when they need them, [Camp Yalla](/programs/camp-yalla), and [Happenings](/programs/yalla-happenings) like immersive play, weekend play and evenings out.",
  },
  {
    id: "membership-needed",
    category: "getting-started",
    alsoIn: ["bookings"],
    pages: { flex: 1, happenings: 4 },
    order: 20,
    status: "published",
    question: "Do I need a membership to book?",
    answer:
      "No. Yalla Flex, Camp Yalla and Yalla Happenings (including Immersive Play, Weekend Play and After Hours evenings) are booked online, one session at a time, and anyone can pay as they go.\n\nClub Yalla is our recurring weekday membership and begins with an [application](/apply). A [Play Pass](/play-passes) is optional: it’s a monthly membership that gives you more to spend on the same experiences.",
  },
  {
    id: "explore-programs",
    category: "getting-started",
    order: 30,
    status: "published",
    question: "How do I explore available programs and experiences?",
    answer:
      "Start with [Programs](/programs) for an overview of each way to join Yalla. When you’re ready to see dates, [Explore Yalla](/book) shows live availability for Yalla Flex, Camp Yalla and Yalla Happenings, which you can filter by offering, your child’s age and date. The [Happenings calendar](/programs/yalla-happenings) shows every upcoming Happening in one place.",
  },
  {
    id: "how-to-book",
    category: "getting-started",
    pages: { happenings: 3 },
    order: 40,
    status: "published",
    question: "How do I book a Yalla experience?",
    answer:
      "Head to [Explore Yalla](/book), filter by offering, your child’s age and date, then choose your sessions and reserve. You’ll sign in to your Family Portal (or create an account) to check out, and everything you book appears there afterward.",
  },
  {
    id: "schedule-tour",
    category: "getting-started",
    order: 50,
    status: "published",
    question: "How do I schedule a tour?",
    answer:
      "Request a time on our [Book a tour](/book-a-tour) page. Visits are by appointment, and your tour guide will meet you in the front lobby at the time of your tour.\n\nFor Club Yalla, families begin with an [application](/apply). Applications are accepted year-round, first come, first served, depending on cohort availability, and we’ll reach out to invite you to tour and ask us anything.",
  },
  {
    id: "what-is-portal",
    category: "getting-started",
    order: 60,
    status: "published",
    question: "What is the Family Portal?",
    answer:
      "Your family’s home at Yalla online. Explore and book Yalla experiences, manage your family’s details, and access your reservations, memberships, forms, and payments in one convenient place.",
  },
  {
    id: "access-portal",
    category: "getting-started",
    order: 70,
    status: "published",
    question: "How do I access my Family Portal?",
    answer:
      "[Create your family account](/portal/join) with your name, email and a password, and add your children with their dates of birth. After that, [sign in](/portal) with your email and password whenever you like; you’ll stay signed in on that browser.\n\nForgot your password? Choose “Forgot your password” on the sign-in page and we’ll email you a link to set a new one.",
  },
  {
    id: "hours",
    category: "getting-started",
    order: 80,
    status: "published",
    question: "What are your hours?",
    answer:
      "Hours vary by program. Our weekday cohorts (Club Yalla and Yalla Flex) run year-round: full days 8:30am to 4:30pm, half days 8:30am to 12:00pm, with Early Bird care from 8:00am. Camps and Happenings have their own times, listed in the booking calendar.",
  },
  {
    id: "paperwork",
    category: "getting-started",
    order: 90,
    status: "published",
    question: "What paperwork is needed before my child’s first day?",
    answer: "Before your child’s first day, please submit their onboarding packet, with all required forms, through the [Family Portal](/portal), where you can see what’s still outstanding for each child.\n\nEvery child onsite must have a completed onboarding packet in order to participate in memberships and programs at Yalla.",
  },

  /* ── Club Yalla ── */
  {
    id: "what-is-club-yalla",
    category: "club-yalla",
    order: 10,
    status: "published",
    question: "What is Club Yalla?",
    answer:
      "Club Yalla is our year-round weekday membership for parents who work remotely, offering dedicated coworking with high-quality childcare onsite. Settle into your work alongside other parents while your child spends their days playing, creating, and exploring in a small cohort with familiar, attentive caregivers.",
  },
  {
    id: "club-included",
    category: "club-yalla",
    pages: { "club-yalla": 1 },
    order: 20,
    status: "published",
    question: "What does a Club Yalla membership include?",
    answer:
      "- Onsite childcare rooted in the Reggio Emilia and RIE approaches\n- Credentialed early childhood educators\n- Communal coworking, high-speed internet, coffee, tea and light snacks\n- Coworking kitchen and unlimited color printing",
  },
  {
    id: "club-ages",
    category: "club-yalla",
    order: 30,
    status: "published",
    question: "What ages does Club Yalla serve?",
    answer: "Club Yalla serves children from 4 months to 5 years, in small cohorts of children close in age. [See cohorts and membership rates](/membership).",
  },
  {
    id: "club-ratios",
    category: "club-yalla",
    order: 35,
    status: "published",
    question: "What are your caregiver-to-child ratios?",
    answer:
      "Our weekday cohorts are deliberately small. Seedlings and Saplings have a maximum ratio of 1:4 and at most 8 children; Sprouts 1:6 with at most 12; and Wildflowers 1:8 with at most 12.",
  },
  {
    id: "club-schedule",
    category: "club-yalla",
    pages: { "club-yalla": 2 },
    order: 40,
    status: "published",
    question: "How does weekday scheduling work?",
    answer:
      "Members choose consistent days each week, one to five days, so your child settles into a familiar rhythm with the same caregivers and peers. Full days run 8:30am to 4:30pm and half days 8:30am to 12:00pm, with Early Bird care from 8:00am.",
  },
  {
    id: "club-change-days",
    category: "club-yalla",
    order: 50,
    status: "draft",
    needs: "How families request a change to their days, how much notice is needed, and whether it depends on cohort availability.",
    question: "Can I change my child’s scheduled days?",
    answer: "",
  },
  {
    id: "club-onsite",
    category: "club-yalla",
    pages: { "club-yalla": 3 },
    order: 60,
    status: "published",
    question: "Do parents need to remain onsite?",
    answer:
      "Yes. Club Yalla is childcare and coworking together: parents and caregivers work onsite in our coworking space while children are in care. You get uninterrupted time for your own work, and you’re close by all day. That closeness is what Club Yalla is built around.",
  },
  {
    id: "club-tuition",
    category: "club-yalla",
    pages: { "club-yalla": 4 },
    order: 70,
    status: "published",
    question: "How does tuition and billing work?",
    answer:
      "Club Yalla tuition is a monthly rate that depends on your child’s cohort and how many days a week you choose, starting from $275 a month. [See all membership rates](/membership), including additional fees and coworking options.",
  },
  {
    id: "club-absence",
    category: "club-yalla",
    order: 80,
    status: "draft",
    needs: "What happens with tuition or credits when a child is absent, and how families let Yalla know.",
    question: "What happens if my child is absent?",
    answer: "",
  },
  {
    id: "club-cancel",
    category: "club-yalla",
    pages: { "club-yalla": 6 },
    order: 90,
    status: "published",
    question: "How do I cancel my Club Yalla membership?",
    answer: "Club Yalla memberships require 30 days’ written notice to cancel, submitted through your Family Portal or by email to [membership@yallaspacesd.com](mailto:membership@yallaspacesd.com). Your membership stays active throughout the notice period, and we’ll confirm your end date and any remaining charges in writing. Club Yalla memberships can’t be paused, and once a membership ends, the spot is offered to the next family on our waitlist. See [canceling a membership](/policies#canceling-a-membership), including how the final payment works.",
  },
  {
    id: "meals",
    category: "club-yalla",
    order: 100,
    status: "draft",
    needs: "Which meals and snacks Yalla provides and what families send.",
    question: "Are meals and snacks provided?",
    answer: "",
  },
  {
    id: "rest-time",
    category: "club-yalla",
    order: 110,
    status: "draft",
    needs: "How rest time works for each age group.",
    question: "How does rest time work?",
    answer: "",
  },

  /* ── Play Pass ── */
  {
    id: "what-is-play-pass",
    category: "play-pass",
    order: 10,
    status: "published",
    question: "What is a Play Pass membership?",
    answer:
      "A Play Pass is a monthly membership that adds a balance to your family’s Yalla Wallet. Your Play Pass balance works like a spending wallet: use it toward eligible Yalla experiences, share it between your children, and book whatever fits your family’s schedule.",
  },
  {
    id: "play-pass-options",
    category: "play-pass",
    pages: { "play-pass": 1 },
    order: 20,
    status: "published",
    question: "What are the different Play Pass membership options?",
    answer:
      "There are three, each adding more to spend than you pay:\n\n- **Play**: $120 a month, with $135 to spend\n- **Gather**: $180 a month, with $200 to spend\n- **Belong**: $240 a month, with $270 to spend\n\n[Compare Play Passes](/play-passes).",
  },
  {
    id: "play-pass-how",
    category: "play-pass",
    pages: { "play-pass": 2 },
    order: 30,
    status: "published",
    question: "How does Play Pass membership work?",
    answer:
      "Play Passes are billed monthly on the 1st, and your new balance is added as soon as that payment goes through.\n\nIf you join partway through a month, your first payment and your first balance both cover just the days left in that month. For example, a Gather Play Pass started on November 16 is $90 that day with $100 to spend, then $180 with $200 to spend from December 1. You’ll see both amounts before you confirm.",
  },
  {
    id: "play-pass-reserve",
    category: "play-pass",
    pages: { "play-pass": 3 },
    order: 40,
    status: "published",
    question: "How do I reserve sessions using my membership?",
    answer:
      "Book the way you always do. When you’re signed in, your balance is applied automatically at checkout. It works for eligible Yalla Happenings, which are marked as accepting Play Pass when you book. Some special programs, such as camps and select workshops, have their own pricing and aren’t included.\n\nEvery experience keeps its published price, per child. Your balance is simply how you pay, and it’s shared by your whole family, so it works for any of your children.",
  },
  {
    id: "play-pass-beyond",
    category: "play-pass",
    order: 50,
    status: "published",
    question: "Can I book additional sessions beyond my membership benefits?",
    answer: "Yes. If your balance covers everything, there’s nothing more to pay; if it covers part, you pay the rest by card. Everyone books from the same calendar.",
  },
  {
    id: "play-pass-rollover",
    category: "play-pass",
    pages: { "play-pass": 4 },
    order: 60,
    status: "published",
    question: "Do unused membership benefits roll over?",
    answer: "Unused balance carries into the next month. We’ll always tell you ahead of time before any change to how unused balance is handled.",
  },
  {
    id: "play-pass-change",
    category: "play-pass",
    pages: { "play-pass": 5 },
    order: 70,
    status: "published",
    question: "Can I change my Play Pass membership tier?",
    answer: "Yes. You can upgrade anytime, without advance notice. Downgrades need 30 days’ notice and take effect once the notice period ends. See [upgrades, downgrades and pauses](/policies#membership-changes).",
  },
  {
    id: "play-pass-cancel",
    category: "play-pass",
    pages: { "play-pass": 6 },
    order: 80,
    status: "published",
    question: "How do I cancel my Play Pass membership?",
    answer: "Play Pass memberships require 30 days’ notice to cancel, submitted through your Family Portal or by email to [membership@yallaspacesd.com](mailto:membership@yallaspacesd.com). Regular billing continues through the notice period. See [canceling a membership](/policies#canceling-a-membership), including how the final payment works.",
  },

  /* ── Bookings & Happenings ── */
  {
    id: "experience-types",
    category: "bookings",
    order: 10,
    status: "published",
    question: "What types of experiences can I reserve?",
    answer:
      "- [Yalla Flex](/programs/yalla-flex): weekday childcare and coworking by the day\n- [Camp Yalla](/programs/camp-yalla): seasonal camp days\n- [Yalla Happenings](/programs/yalla-happenings): Immersive Play Sessions, Weekend Play Sessions, After Hours Evenings, and pop-ups and gatherings\n\nFamilies in the Yalla community can also reserve private offices and desks in our coworking space from the Family Portal.",
  },
  {
    id: "what-is-flex",
    category: "bookings",
    order: 20,
    status: "published",
    question: "What is Yalla Flex?",
    answer:
      "Yalla Flex is drop-in childcare and coworking for families who need care here and there rather than a regular membership. On the days you book, your child spends the day in a play environment with similarly aged peers and attentive educarers and guides, while you settle into our coworking space a few steps away. [See available days](/book?offering=drop_in).",
  },
  {
    id: "what-is-camp",
    category: "bookings",
    pages: { camp: 2 },
    order: 30,
    status: "published",
    question: "What is Camp Yalla?",
    answer:
      "Camp days for children 18 months to 10 years, planned with the same care as every Yalla day: unhurried, hands-on and full of discovery. Camp runs 9:00am to 3:00pm, with optional Early Bird care from 8:00am and a late stay until 4:30pm. Book the days that suit your family; [see camp dates](/programs/camp-yalla).",
  },
  {
    id: "camp-day",
    category: "bookings",
    pages: { camp: 3 },
    order: 35,
    status: "published",
    question: "What does a camp day look like?",
    answer:
      "Each camp is built around an idea children can explore with their hands: making, building, growing, getting messy and discovering. Children spend the day with others close to their age, in three groups: 18 months to 4 years, 4 to 6 years, and 7 to 10 years.",
  },
  {
    id: "what-are-happenings",
    category: "bookings",
    pages: { happenings: 1 },
    order: 40,
    status: "published",
    question: "What are Yalla Happenings?",
    answer:
      "Happenings are how we gather: small, thoughtful events, all in one calendar.\n\n- **Immersive Play Sessions**: three-hour blocks for children 3 to 8 to settle in and go deep in their play\n- **Weekend Play Sessions**: a morning or afternoon of play with others their age\n- **After Hours Evenings**: an evening of play for children while parents head out\n- **Pop-ups & gatherings**: workshops and get-togethers, with details listed for each\n\n[See the Happenings calendar](/programs/yalla-happenings).",
  },
  {
    id: "ages-by-offering",
    category: "bookings",
    pages: { flex: 2, camp: 1, happenings: 2 },
    order: 50,
    status: "published",
    question: "What ages are eligible for each offering?",
    answer:
      "- **Club Yalla**: 4 months – 5 years\n- **Yalla Flex**: 3 months – 5 years\n- **Camp Yalla**: 18 months – 10 years\n- **Immersive Play Sessions**: 3 – 8 years\n- **Weekend Play Sessions**: 18 months – 10 years\n- **After Hours Evenings**: 18 months – 10 years\n\nOther Happenings list their ages with each event. When you book, we’ll only offer sessions that fit your child’s age.",
  },
  {
    id: "what-to-bring",
    category: "bookings",
    pages: { flex: 4, camp: 4 },
    order: 60,
    status: "published",
    question: "What should my child bring?",
    answer:
      "Please send your child with a labeled water bottle, lunch box, light jacket, and one spare outfit. Label all belongings so we can help them find their way home.\n\nComfortable clothes that can get messy are encouraged: mud, water, paint, and other hands-on materials are often part of our play. Some programs include extra packing notes in their booking confirmation. Yalla is nut-free, so please don’t send foods containing peanuts or tree nuts.",
  },
  {
    id: "flex-arrival",
    category: "bookings",
    pages: { flex: 3 },
    order: 65,
    status: "published",
    question: "How do arrival and departure work on a Flex day?",
    answer:
      "Check your child in and sign them out at our lobby kiosk. Yalla Flex is childcare and coworking together, so you’ll stay onsite in our coworking space while your child is in care. Please keep your family profile current with emergency contacts and everyone authorized to collect your child; we may ask for photo identification. See [arrival and departure](/policies#arrival-departure).",
  },
  {
    id: "camp-meals",
    category: "bookings",
    order: 66,
    status: "draft",
    needs: "Whether camp provides lunch or snacks, and what children should bring.",
    question: "What should my child bring to camp?",
    answer: "",
  },
  {
    id: "change-cancel-reservation",
    category: "bookings",
    pages: { flex: 5, camp: 5, happenings: 5 },
    order: 70,
    status: "published",
    question: "How do I change or cancel a reservation?",
    answer: `Cancel through your Family Portal, by phone at 619.775.4008, or by email at [hello@yallaspacesd.com](mailto:hello@yallaspacesd.com). Cancel at least 24 hours before your reservation begins and the amount paid is returned to your family’s Yalla Wallet as a credit; no-shows aren’t eligible for credit. If your child is unwell, please let us know as soon as you can: illness and other extenuating circumstances may be exempt from the 24-hour requirement. Read our full ${POLICY_LINK}.`,
  },
  {
    id: "multiple-children",
    category: "bookings",
    order: 80,
    status: "published",
    question: "Can I book multiple children?",
    answer: "Yes. When you check out, choose each child who’s coming. We’ll only offer the sessions that fit each child’s age.",
  },
  {
    id: "view-reservations",
    category: "bookings",
    order: 90,
    status: "published",
    question: "Where can I view my upcoming reservations?",
    answer: "In your [Family Portal](/portal), along with your memberships, forms and payments.",
  },
  {
    id: "session-full",
    category: "bookings",
    order: 100,
    status: "published",
    question: "What happens if a session is full?",
    answer: "You can join the waitlist from the booking calendar, and we’ll let you know if a space opens up.",
  },
  {
    id: "repeat-booking",
    category: "bookings",
    order: 110,
    status: "draft",
    needs: "Confirm whether families can book a recurring weekly day in one go.",
    question: "Can I book the same day every week?",
    answer: "Yes. Repeat bookings let you reserve a recurring day (every Tuesday, say) in one go.",
  },
  {
    id: "immersive-deep-play",
    category: "bookings",
    pages: { immersive: 1 },
    order: 200,
    status: "published",
    question: "What is deep play?",
    answer:
      "Deep play is a state of sustained, absorbed play in which children follow their curiosity and become immersed in their own ideas. Blocks become a bustling city, a piece of fabric becomes an ocean, and an imaginary adventure unfolds between friends. Given time and freedom, children build on these ideas, solve problems, navigate relationships, and explore new possibilities. Adults remain available for support while allowing children to lead. The magic comes from having space to wonder, create, and see where their imagination takes them.",
  },
  {
    id: "immersive-value",
    category: "bookings",
    pages: { immersive: 2 },
    order: 210,
    status: "published",
    question: "What is the value of an Immersive Play Session?",
    answer:
      "In a world of screens, busy schedules, and frequent interruptions, time for deep play can be fleeting. Shared spaces where children can explore freely and let their ideas grow together can be difficult to find. This kind of play needs time, an inviting environment, and the freedom to follow an idea without being hurried to the next activity.\n\nOur three-hour Immersive Play Sessions protect that space. Thoughtfully prepared play landscapes invite creativity, collaboration, and discovery, while attentive guides offer support and help children navigate social-emotional challenges without taking over their play. Children have time to build friendships, work through problems, and experience the magic of bringing their own ideas to life.\n\nFor parents, whose free time is often limited, these sessions offer room to focus on work, take a workout class, or simply recharge, knowing their children are enjoying meaningful connection and the freedom to become deeply absorbed in play.",
  },
  {
    id: "immersive-mixed-age",
    category: "bookings",
    pages: { immersive: 3 },
    order: 220,
    status: "published",
    question: "Why do Immersive Play Sessions welcome a mixed-age group?",
    answer:
      "Early childhood extends through age eight, encompassing a rich period of imagination, discovery, and learning through play. While children across these ages have different abilities and needs, they often share a curiosity about one another and enjoy opportunities to play and learn together.\n\nYounger children find inspiration in older children’s ideas, language, and approaches to challenges. Older children have opportunities to practice patience, empathy, and leadership, while rediscovering the delight of a younger child’s perspective. Each child can contribute something meaningful, and learning flows in both directions.\n\nWith most groups and activities separated by age, these connections can be hard to find outside sibling relationships. Our mixed-age sessions make room for them. Open-ended play landscapes offer different ways to engage, and guides support children in finding playmates, maintaining boundaries, and participating at their own pace. Children can connect through shared interests, with room to be both a learner and someone another child learns from.",
  },
  {
    id: "immersive-bring",
    category: "bookings",
    pages: { immersive: 4 },
    order: 230,
    status: "published",
    question: "What should my child bring to an Immersive Play Session?",
    answer:
      "Please send your child with a labeled water bottle, lunch box, light jacket, and one spare outfit. Label all belongings so we can help them find their way home.\n\nDress your child in comfortable clothes that can get messy! Mud, water, paint, and other hands-on materials are often part of our play, and we want children to feel free to explore without worrying about their clothes.",
  },

  /* ── Billing & Policies ── */
  {
    id: "cancellation-refund-policy",
    category: "billing",
    pages: { "club-yalla": 7, "play-pass": 7 },
    order: 10,
    status: "published",
    policy: "cancellation-refund",
    question: "What is Yalla’s cancellation and refund policy?",
    answer: "",
  },
  {
    id: "yalla-wallet",
    category: "billing",
    order: 20,
    status: "published",
    question: "What is the Yalla Wallet?",
    answer:
      "Your Yalla Wallet keeps your family’s cancellation credits together so you can use them toward future Yalla bookings. Credits can be used for any Yalla service or experience except recurring membership dues, are nontransferable, and stay in your wallet even if you cancel your membership. When you’re signed in, your wallet is applied automatically at checkout.\n\nPlay Pass members also see their monthly Play Pass balance here. Membership benefits are kept separate from cancellation credits.",
  },
  {
    id: "wallet-credit-length",
    category: "billing",
    order: 30,
    status: "published",
    question: "How long do Yalla Wallet credits last?",
    answer: "Each cancellation credit is valid for 24 months from the date it’s issued. The 24-month period applies to cancellation credits, not to unused membership benefits. See [your Yalla Wallet](/policies#yalla-wallet).",
  },
  {
    id: "cash-refunds",
    category: "billing",
    order: 40,
    status: "published",
    question: "Can I receive a cash refund?",
    answer: "Yalla doesn’t provide cash refunds for family-initiated cancellations, except where required by law; the amount paid is returned to your Yalla Wallet as a credit instead. If Yalla cancels your reservation, you can choose a full refund to your original payment method or a Yalla Wallet credit plus 5%. See [if Yalla cancels or changes your reservation](/policies#yalla-cancels).",
  },
  {
    id: "prorated-billing",
    category: "billing",
    order: 50,
    status: "published",
    question: "How does prorated membership billing work?",
    answer: `When you join a Play Pass partway through a month, your first payment and your first balance both cover just the days left in that month, and you’ll see both amounts before you confirm.\n\nWhen a Club Yalla or Play Pass membership ends partway through a month, a prorated final payment is charged on the 1st of that month. We divide your monthly fee by the number of days in that month, then multiply by the days up to and including your membership end date. See [your final payment](/policies#canceling-a-membership).`,
  },
  {
    id: "yalla-cancels",
    category: "billing",
    order: 45,
    status: "published",
    policy: "yalla-cancels",
    question: "What happens if Yalla cancels or changes my reservation?",
    answer: "",
  },
  {
    id: "membership-changes",
    category: "billing",
    alsoIn: ["club-yalla", "play-pass"],
    order: 55,
    status: "published",
    policy: "membership-changes",
    question: "Can I pause, upgrade, or downgrade my membership?",
    answer: "",
  },
  {
    id: "late-fee",
    category: "bookings",
    order: 95,
    status: "published",
    question: "What if I’m running late?",
    answer:
      "Please call us at 619.775.4008 as soon as you know. A late arrival doesn’t extend your reserved session, and after a five-minute grace period at the end of the session, a late fee of $10 is charged for each additional 10 minutes. Letting us know doesn’t waive the fee, but it helps our team plan.",
  },
  {
    id: "nut-free",
    category: "getting-started",
    order: 85,
    status: "published",
    policy: "food-allergies",
    question: "Is Yalla nut-free?",
    answer: "",
  },
  {
    id: "update-payment",
    category: "billing",
    order: 60,
    status: "draft",
    needs: "How families update their card for Club Yalla and Play Pass once live payments are on.",
    question: "How do I update my payment information?",
    answer: "",
  },
  {
    id: "billing-history",
    category: "billing",
    order: 70,
    status: "published",
    question: "Where can I view my billing history?",
    answer: "Sign in to your [Family Portal](/portal) and open Payments to see your invoices, what you’ve paid and any credit on your account. Play Pass members can also see their balance activity under My Play Pass.",
  },
];
