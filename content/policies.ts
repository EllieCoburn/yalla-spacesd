/**
 * Yalla's formal policies: the one place each policy's wording lives. The Policies & Terms page,
 * FAQ answers and the Family Portal render these; nothing else should restate them.
 *
 * Only policies Yalla has approved belong here. Do not add or reword policy language without Yalla.
 */

/** Shown at the top of Policies & Terms once Yalla sets it, e.g. "2026-12-01". Hidden while null. */
export const POLICIES_EFFECTIVE_DATE: string | null = null;

export const POLICIES_INTRO =
  "Our policies help keep Yalla welcoming, thoughtful, and predictable for everyone. Here you’ll find the details on reservations, memberships, payments, and spending time in our community.";

export const POLICY_CHAPTERS = [
  { id: "reservations", title: "Reservations, Payments & Cancellations" },
  { id: "memberships", title: "Memberships" },
  { id: "attendance", title: "Attendance, Arrival & Departure" },
  { id: "health", title: "Health, Food & Individual Support" },
  { id: "community", title: "Play & Community Life" },
  { id: "safety", title: "Emergencies, Privacy & Communication" },
] as const;

export type PolicyChapter = (typeof POLICY_CHAPTERS)[number]["id"];

export type Policy = {
  id: string;
  title: string;
  /** Approved: shown on the site. */
  approved: boolean;
  /** Listed on the public Policies & Terms page. Family-only policies live in the Family Portal. */
  public: boolean;
  /** Where it sits on Policies & Terms. */
  chapter?: PolicyChapter;
  /**
   * Paragraphs use the FAQ formatting: a blank line between paragraphs, "- " for list items,
   * [words](link) for links and **words** for emphasis. `short` names a section in a page's contents;
   * `note` sets a paragraph apart as a callout.
   */
  sections: { heading?: string; short?: string; note?: boolean; paragraphs: string[] }[];
};

const PHONE = "619.775.4008";
const HELLO = "[hello@yallaspacesd.com](mailto:hello@yallaspacesd.com)";
const MEMBERSHIP = "[membership@yallaspacesd.com](mailto:membership@yallaspacesd.com)";

const p = (id: string, chapter: PolicyChapter, title: string, ...paragraphs: string[]): Policy => ({ id, chapter, title, approved: true, public: true, sections: [{ paragraphs }] });

export const POLICIES: Policy[] = [
  /* ── Reservations, Payments & Cancellations ── */
  p(
    "making-a-reservation",
    "reservations",
    "Making a reservation",
    "Yalla programming and coworking are available by reservation. Before booking, please review the dates, times, age requirements, parent-presence requirements, and included services for the offering you’ve chosen.",
    "A reservation is confirmed once you receive your booking confirmation and any required payment has been completed. Each child attending must be included in the reservation.",
  ),
  p(
    "payments",
    "reservations",
    "Payments",
    "Individual bookings are paid at checkout. Membership charges follow the billing schedule provided when you enroll. Any additional charges will be explained before you authorize them.",
  ),
  p(
    "failed-payments",
    "reservations",
    "Failed payments",
    "If your payment is unsuccessful, your reserved space will be held for 12 hours from the time of booking so you can resolve the payment issue. If payment isn’t completed within that period, your reservation will be released and the space made available to other families.",
    "You’re welcome to pay onsite if space is still available when you arrive. However, availability can’t be guaranteed without a confirmed, paid reservation.",
  ),
  {
    id: "cancellation-refund",
    chapter: "reservations",
    title: "Canceling a reservation",
    approved: true,
    public: true,
    sections: [
      {
        paragraphs: [
          "When you cancel a reservation, the amount paid is returned to your family’s Yalla Wallet as a credit. Cancellation credits may be used for up to 24 months from the date they are issued. Yalla does not provide cash refunds for family-initiated cancellations, except where required by law.",
        ],
      },
      {
        heading: "24 hours’ notice",
        paragraphs: [
          "To receive a credit, please cancel at least 24 hours before your reservation begins. No-shows are not eligible for credit.",
          "We understand that unexpected circumstances arise, particularly when little ones are feeling under the weather. Illness and other extenuating circumstances may be exempt from the 24-hour requirement. We would always rather a child stay home to rest and recover than attend Yalla while unwell.",
        ],
      },
      {
        heading: "How to cancel",
        paragraphs: [
          `Cancel through your [Family Portal](/portal), call us at ${PHONE}, or email ${HELLO}. If illness or another extenuating circumstance prevents you from giving 24 hours’ notice, please contact us as soon as you can.`,
        ],
      },
      {
        heading: "Memberships",
        paragraphs: ["Club Yalla and Play Pass memberships require 30 days’ notice to cancel. See [canceling a membership](/policies#canceling-a-membership)."],
      },
    ],
  },
  p(
    "yalla-wallet",
    "reservations",
    "Your Yalla Wallet",
    "Your Yalla Wallet keeps your family’s cancellation credits together so you can use them toward future Yalla bookings.",
    "Wallet credits can be used toward any Yalla service or experience except recurring membership dues. Credits are nontransferable and remain in your family’s Yalla Wallet even if you cancel your membership. Each credit is valid for 24 months from the date it is issued.",
    "Cancellation credits are separate from the monthly benefits included with a membership. The 24-month credit period does not apply to unused membership benefits.",
  ),
  p(
    "yalla-cancels",
    "reservations",
    "If Yalla cancels or changes your reservation",
    "If Yalla needs to cancel or make a significant change to your reservation, we’ll let you know promptly using the contact information on your booking. When Yalla cancels a reservation, you may choose either:",
    "- **Yalla Wallet credit plus 5%**: the full value of your reservation as a Yalla Wallet credit, plus an extra 5% as a thank-you for your flexibility. For example, a canceled $180 reservation becomes a $189 credit.\n- **A full refund**: the original amount paid, returned to your original payment method. Yalla processes refunds within 7 business days; how long the funds take to appear depends on your bank or card issuer.",
    "We want families to feel confident booking with Yalla, knowing that if we need to change plans, we’ll make things right.",
  ),

  /* ── Memberships ── */
  p(
    "choosing-a-membership",
    "memberships",
    "Choosing your membership",
    "[Club Yalla](/club-yalla) and [Play Pass](/play-passes) memberships offer different ways to be part of our community. Your enrollment details explain the services, access, and benefits included with your plan.",
    "A membership does not guarantee availability outside your confirmed schedule or reservations.",
  ),
  p(
    "membership-billing",
    "memberships",
    "Monthly billing and renewal",
    "Memberships renew automatically and are billed on the 1st of each month, unless your enrollment agreement says otherwise. Pricing, recurring charges, and cancellation terms are shown to you before you enroll.",
  ),
  {
    id: "canceling-a-membership",
    chapter: "memberships",
    title: "Canceling a membership",
    approved: true,
    public: true,
    sections: [
      {
        heading: "Club Yalla",
        paragraphs: [
          `Club Yalla memberships require 30 days’ written notice, submitted through your [Family Portal](/portal) or by email to ${MEMBERSHIP}. Your notice period begins on the date you submit your request, and your membership stays active throughout it. We’ll confirm your membership end date and any remaining charges in writing. Club Yalla memberships can’t be paused; once your membership ends, your child’s spot is offered to the next family on our waitlist.`,
        ],
      },
      {
        heading: "Play Pass",
        paragraphs: [
          `Play Pass memberships require 30 days’ notice, submitted through your [Family Portal](/portal) or by email to ${MEMBERSHIP}. We’ll confirm your membership end date and any remaining charges after you submit your request.`,
        ],
      },
      {
        heading: "Your final payment",
        paragraphs: [
          "Regular billing continues throughout your 30-day notice period. If your notice period ends partway through a month, a prorated final payment is charged on the 1st of that month, covering only the days through your membership end date.",
          "To prorate, we divide your monthly fee by the number of days in that month, then multiply by the number of days up to and including your membership end date.",
        ],
      },
      {
        paragraphs: ["Canceling an individual reservation does not cancel your membership."],
      },
    ],
  },
  p(
    "membership-changes",
    "memberships",
    "Upgrades, downgrades and pauses",
    "We understand that your family’s needs may change, and memberships can change with them.",
    "- **Upgrades**: upgrade anytime, without advance notice.\n- **Downgrades**: downgrade with 30 days’ notice. Your new membership takes effect once the notice period ends.\n- **Pauses (Play Pass only)**: pause for up to 60 consecutive days, with 30 days’ notice. Your membership reactivates automatically and regular billing resumes on the 61st day.\n- **Canceling during a pause**: if you decide not to return, submit your cancellation at least 30 days before your scheduled reactivation date. Otherwise, your membership reactivates on the 61st day and regular billing continues until your 30-day notice takes effect.",
    "**Club Yalla memberships can’t be paused.** Club Yalla spots are held for each child, so when a membership is canceled, the spot is offered to the next family on our waitlist.",
    `Please submit downgrade, pause, and cancellation requests through your [Family Portal](/portal) or by email to ${MEMBERSHIP}.`,
  ),

  /* ── Attendance, Arrival & Departure ── */
  p(
    "parent-presence",
    "attendance",
    "Parent presence",
    "Each offering notes whether a parent or caregiver stays onsite or whether children can stay on their own. Please follow the requirements for the program you’ve reserved.",
    "Club Yalla and Yalla Flex require a parent or designated caregiver to remain onsite. For offerings where parents may leave, an authorized adult must stay reachable throughout the session and be available to collect their child if needed.",
  ),
  p(
    "arrival-departure",
    "attendance",
    "Arrival and departure",
    "Children are checked in and signed out at our lobby kiosk. Please keep your family profile up to date with current emergency contacts and everyone authorized to collect your child.",
    "We may ask for photo identification before releasing a child to an authorized adult.",
  ),
  p(
    "late-departure",
    "attendance",
    "Running late",
    `Please let us know if you’re running late. A late arrival doesn’t extend your reserved session.`,
    `Please plan to collect your child by the end of their reserved session. After a five-minute grace period, a late fee of $10 is charged for each additional 10 minutes. If you expect to be delayed, please call ${PHONE} as soon as possible so our team can plan; letting us know doesn’t waive the late fee.`,
  ),
  p(
    "what-to-bring",
    "attendance",
    "What to bring",
    "Please send your child with a labeled water bottle, lunch box, light jacket, and one spare outfit. Label all belongings so we can help them find their way home.",
    "Comfortable clothes that can get messy are encouraged. Mud, water, paint, and other hands-on materials are often part of our play. Some programs include extra packing notes in their booking confirmation.",
  ),

  /* ── Health, Food & Individual Support ── */
  p(
    "illness-summary",
    "health",
    "Illness",
    "Please keep your child home when they’re unwell or unable to comfortably take part in the session. If your child becomes ill while at Yalla, we’ll contact you to arrange for them to go home.",
    "Enrolled families can read the full [illness policy](/portal/illness-policy) in the Family Portal, including when to keep your child home and when they can return.",
  ),
  p(
    "food-allergies",
    "health",
    "Food and allergies",
    "Yalla is a nut-free environment. Please don’t send foods containing peanuts or tree nuts.",
    "Tell us about any food allergies, dietary needs, or emergency care requirements before your child attends. We ask families to avoid sharing food and to work with our team on any individual food-safety arrangements. Although we take precautions, we can’t guarantee an allergen-free environment.",
  ),
  p(
    "medication",
    "health",
    "Medication and topical products",
    "Yalla does not give medication, with two exceptions: emergency medication, such as an EpiPen, and authorized over-the-counter topical products, such as diaper rash cream, sunscreen, and ointments.",
    "A completed authorization form must be on file before our team can give any emergency medication or apply any topical product. Products must be in their original packaging, labeled with your child’s name, and come with instructions that match the authorization form. Please hand them directly to a team member rather than leaving them in your child’s bag.",
    "EpiPens are the only medication we keep onsite. Please provide them in a storage container labeled with your child’s name, with the authorization and emergency care instructions on file. Other authorized products come with your child each session and go home with them at departure.",
  ),
  p(
    "individual-support",
    "health",
    "Helping us support your child",
    "Children arrive with different temperaments, experiences, and support needs. Please share anything that helps us welcome your child, such as communication preferences, sensory needs, toileting support, separation concerns, and comforting routines.",
    "We welcome conversations about accommodations and will work with you to understand the support your child needs.",
  ),

  /* ── Play & Community Life ── */
  p(
    "approach-to-play",
    "community",
    "Our approach to play",
    "We create thoughtful environments where children can explore, build relationships, and follow their own ideas. Our educarers and guides observe closely and offer support, gentle redirection, and help navigating social-emotional challenges.",
    "Our goal is to protect meaningful play while helping children care for themselves, one another, and the space.",
  ),
  p(
    "community-safety",
    "community",
    "Keeping our community safe",
    "Children are learning how to communicate, manage big feelings, and share space. We respond to challenges with calm support and clear boundaries.",
    "If a situation can’t be safely supported during a session, we may ask a parent or caregiver to help or to take their child home early. When challenges continue, we’ll work with the family on next steps and any additional support or accommodations.",
    "Adults are expected to treat children, families, and team members with respect. Threatening, discriminatory, or abusive conduct is not permitted.",
  ),
  p(
    "ending-participation",
    "community",
    "Suspending or ending participation",
    "Yalla may suspend or end a child’s participation when necessary for the safety, well-being, and needs of that child, other children, and our community. If we make that decision, we’ll speak with the family directly and explain the circumstances.",
    "When Yalla ends a child’s participation, we refund the full remaining value of any unused, prepaid sessions to the original payment method; families are never asked to accept Yalla Wallet credit instead. Yalla processes these refunds within 7 business days; how long the funds take to appear depends on your bank or card issuer.",
  ),
  p(
    "outdoor-play",
    "community",
    "Outdoor and messy play",
    "Outdoor exploration is part of life at Yalla. Children may play with water, mud, paint, and natural materials, with activities adjusted for weather and conditions. Please dress your child for the day’s forecast, and expect signs of a good day’s play on their clothes.",
    "We’ll let you know in advance about any activity that needs separate permission.",
  ),
  p(
    "coworking",
    "community",
    "Coworking and shared spaces",
    "Please use workspaces and communal areas with consideration for others, and follow posted guidance for calls, room reservations, and shared equipment.",
    "Private offices and desks are reserved through the [Family Portal](/portal/spaces) by families in the Yalla community. Outside a child’s booked session, parents and caregivers are responsible for supervising their children.",
  ),
  p(
    "belongings",
    "community",
    "Personal belongings, lost and found",
    "Please bring only what your child needs for the session and keep valuables at home. Label everything, and check for your child’s things before you leave.",
    "Lost items are kept for up to 60 days; just ask a team member if something is missing. After 60 days, unclaimed items may be donated or added to Yalla’s collection for community use.",
  ),

  /* ── Emergencies, Privacy & Communication ── */
  p(
    "emergencies",
    "safety",
    "Emergencies and injuries",
    "Families must complete the required emergency information and authorizations before their child attends. Please keep your contact details and emergency contacts current so we can reach you promptly.",
    "If a child needs urgent medical attention, our team will contact emergency services as appropriate and notify the parent or caregiver as soon as possible.",
  ),
  p(
    "photography",
    "safety",
    "Photography",
    "Families choose separately whether to allow photos shared privately with participating families, and photos used publicly on Yalla’s website, social media, or promotional materials. Taking part in our programs never requires photo consent.",
    "Because children share play spaces, your child may occasionally appear in the background of a photo. That never overrides your choices: before sharing, we take reasonable steps to leave out, crop, or blur identifiable children whose families haven’t opted in to that use.",
    `You can update your choices anytime in your [Family Portal](/portal) or by emailing ${HELLO}. Changes apply to future photos and sharing. To have an existing image removed from a Yalla channel, contact us; we can’t guarantee removal of copies others have already downloaded or shared.`,
    "Please respect other families’ privacy and ask before photographing or sharing images of other children.",
  ),
  p(
    "family-information",
    "safety",
    "Family information",
    `We collect the information needed to manage reservations, communicate with families, and support children’s participation. Questions about how your information is collected, used, stored, or shared? Email ${HELLO}.`,
  ),
  p(
    "policy-updates",
    "safety",
    "Policy updates",
    "This page shows the effective date of our policies. We’ll tell affected families directly about any material change to an existing membership or booking before it takes effect, with any required notice or consent.",
  ),
  {
    // Source: "Yalla Coworking & Childcare Illness Policy" (PDF supplied by Yalla). Wording as supplied;
    // underlined phrases are shown in bold.
    id: "illness",
    title: "Yalla Coworking & Childcare Illness Policy",
    approved: true,
    public: false,
    sections: [
      {
        heading: "Non-Exclusionary Symptoms for Childcare Attendance",
        short: "Welcome to attend",
        paragraphs: [
          "Clear nasal drip, itchy or watery eyes, lingering mild coughs that can last for days or weeks after a viral infection, diaper or heat rashes, teething discomfort, low-grade teething fevers (under 100.4°F, accompanied by obvious teething symptoms and no signs of illness), mild post-vaccination tenderness or fever, mild congestion without fever, drooling-related rashes, and chapped cheeks are all considered normal parts of infant and toddler development. Children presenting with one or more of these symptoms, in the absence of other signs of viral illness, are welcome to attend Yalla Childcare.",
        ],
      },
      {
        heading: "Your child must be kept home if they are presenting with any of the following symptoms:",
        short: "Keep your child home",
        paragraphs: [
          [
            "- A fever of 100.4°F or higher requires children to stay home, unless the fever occurs within 96 hours of a vaccination. In that case, children may attend care if they are otherwise comfortable. However, vaccination-related fevers of 102°F or higher still require the child to remain home for their own comfort and well-being.",
            "- The common cold – identified by **three or more** of the following symptoms: nasal drip, notable fatigue, coughing, sneezing, watery eyes, headache, body aches, chills, or a viral rash on any part of the body (especially on or around the child’s hands, feet, or mouth).",
            "- The flu or a stomach bug/virus – identified by **any** of the following symptoms: diarrhea (more than two events in a 4 hour window), vomiting ([see vomiting policy](#vomiting-policy)), stomach pains or cramps, loss of appetite, headache, fatigue, or visible dehydration.",
            "- An active ear or throat infection.",
            "- Conjunctivitis (pink eye) or suspected conjunctivitis.",
            "- Lice or scabies.",
          ].join("\n"),
        ],
      },
      {
        heading: "In order for your child to return to Yalla Childcare the following must be true:",
        short: "Returning to care",
        paragraphs: [
          [
            "- My child has been fever free **for a minimum of 24 hours**.",
            "- My child has not vomited or had diarrhea **for at least 24 hours** nor is my child exhibiting any symptoms of the flu or a stomach bug/virus.",
            "- My child’s nasal drip is clear and my child is not exhibiting two or more signs of the common cold (note: clear nasal drip that needs to be wiped more than once every 15 minutes **is considered a sign of illness** when it presents in tandem with any other cold or flu symptoms).",
            "- If my child was diagnosed with an illness or infection by their doctor, they have been cleared by their doctor to return to daycare.",
          ].join("\n"),
        ],
      },
      {
        heading: "Note: a doctor’s clearance for return will be considered but does not immediately override Yalla Childcare’s illness policy; children cleared by a doctor must still abide by our 24 hours fever free policy and must still be able to meet the following criteria:",
        short: "Ready for group care",
        note: true,
        paragraphs: [
          "Children should be ready to integrate comfortably back into group care upon return to Yalla after illness. If your child has been sick, it is very important to allow them enough time at home to truly recuperate. Please use discretion and have respect for the ages of those in our cohort when you consider returning your child to care and please never return your child to care prematurely as it could prolong the risk of illness circulating within our program. Children will be sent home if they cannot do the following:",
          [
            "- **Share a Caregiver** – Your child should be able to accept care from a shared caregiver without requiring constant one-on-one attention **due to illness-related discomfort**.",
            "- **Participate in Group Activities** – Your child should be comfortable enough to engage in age-appropriate group activities, even if at a lower energy level than usual.",
            "- **Be Fever-Free Without Medication** – Your child should be free of fever (typically under 100.4°F) for **at least 24 hours without the use of fever-reducing medication**.",
            "- **Have an Appetite** – Your child should be able to eat and drink without vomiting or excessive discomfort. Note: Smaller portions or a strong preference for softer/safer foods are normal and understandable as they are recouping from an illness. This will be accommodated.",
            "- **No Contagious Symptoms** – Your child should not have symptoms that pose a risk to others, such as uncontrolled coughing, persistent diarrhea, significant nasal discharge that cannot be managed, or an unexplained rash.",
            "- **Maintain Regular Sleep Patterns** – your child should be able to rest and sleep in a way that aligns with the group care schedule, without excessive fussiness due to lingering discomfort. Note: additional naps, extended naps, or flexed nap schedules **will** be accommodated for children who are recovering from illness.",
            "- **Regulate Emotions and Behaviors** – Your child should be able to self-soothe or be soothed by a caregiver **without excessive distress related to an illness**.",
            "- **No Special Medical Needs Beyond Routine Care** – Your child should not require medical interventions that go beyond the typical scope of childcare staff.",
          ].join("\n"),
        ],
      },
      {
        heading: "Vomiting Policy",
        short: "Vomiting policy",
        paragraphs: [
          "To ensure the health and safety of all children in our care, we ask that families follow the guidelines below regarding vomiting:",
          [
            "- A child must be picked up and remain home for observation if they experience **two or more episodes of vomiting within a four-hour window**, regardless of cause.",
            "- A child must also go home **after a single episode involving the forceful or complete emptying of stomach contents** (e.g., projectile vomiting, large-volume vomiting, or vomiting accompanied by lethargy or discomfort).",
          ].join("\n"),
          "We understand that some children may occasionally spit up or have minor reflux, especially during transitions, after crying, or while coughing. These isolated, low-volume episodes without other symptoms may not require exclusion. However, our team will use professional discretion to assess whether a child is comfortable and able to participate fully in the day’s activities.",
          "If your child is sent home for vomiting, they may return after **24 hours without vomiting** and must be able to eat and participate in regular activities without distress.",
        ],
      },
      {
        heading: "Immune System Support Suggestions:",
        short: "Immune support",
        paragraphs: [
          [
            "- Sleep! The most powerful remedy for illness recovery",
            "- Fresh air and sunshine",
            "- [Vitamin D drops](https://www.amazon.com/dp/B09ZVLWPP3)",
            "- Prebiotics and Probiotics",
            "- Foods High in Vitamin C (Fruits!)",
            "- Omega-3s",
            "- Elderberry Syrup",
            "- Fiber!! Fiber is a huge natural protectant against illness",
          ].join("\n"),
        ],
      },
      {
        heading: "Understanding Why Babies and Toddlers Get Sick in Group Childcare:",
        short: "Why children get sick",
        paragraphs: [
          [
            "- [Children attending childcare can get sick several times a year. Here’s why that happens](https://www.abc.net.au/news/2024-07-07/kids-who-go-to-childcare-get-sick-more-often-than-others/104053704)",
            "- [Why is my child always sick? A pediatrician answers your questions](https://health.choc.org/why-is-my-child-always-sick-a-pediatrician-answers-your-questions/)",
            "- [Why does my child get sick after starting school or day care?](https://www.akronchildrens.org/inside/2024/09/16/why-does-my-child-get-sick-after-starting-school-or-day-care/)",
          ].join("\n"),
        ],
      },
      {
        heading: "Finding Alternative Care:",
        short: "Alternative care",
        paragraphs: [
          "We recognize that for some of our families missing work, especially when their child is sick for multiple consecutive days in a row, is simply not feasible. Families in this situation are strongly encouraged to have a backup nanny or babysitter on call if no alternative support person is available to provide alternative care.",
          "We encourage you to add yourselves to these local childcare groups if you are not already members and network with backup nannies/babysitters for this purpose:",
          ["- [San Diego Nannies and Babysitters](https://www.facebook.com/groups/431396523734132)", "- [San Diego Nannies, Babysitters, Childcare](https://www.facebook.com/groups/198434296327700/)"].join("\n"),
        ],
      },
    ],
  },
];

export const policyById = (id: string) => POLICIES.find((p) => p.id === id && p.approved) ?? null;
export const policyHref = (id: string) => `/policies#${id}`;
