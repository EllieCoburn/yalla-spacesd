/**
 * Yalla's formal policies: the one place each policy's wording lives. FAQ answers and the
 * Policies & Terms page render these; nothing else should restate them.
 *
 * Only policies Yalla has approved belong here. Do not add or reword policy language without Yalla.
 */

export type Policy = {
  id: string;
  title: string;
  /** Approved: shown on the site. */
  approved: boolean;
  /** Listed on the public Policies & Terms page. Family-only policies live in the Family Portal. */
  public: boolean;
  /**
   * Paragraphs use the FAQ formatting: a blank line between paragraphs, "- " for list items,
   * [words](link) for links and **words** for emphasis. `short` names a section in a page's contents;
   * `note` sets a paragraph apart as a callout.
   */
  sections: { heading?: string; short?: string; note?: boolean; paragraphs: string[] }[];
};

export const POLICIES: Policy[] = [
  {
    id: "cancellation-refund",
    title: "Cancellation & refund policy",
    approved: true,
    public: true,
    sections: [
      {
        paragraphs: [
          "We understand that plans change! When you cancel a reservation or service, the amount paid will be returned to your family’s Yalla Wallet as a credit that can be applied toward future bookings and services for up to 24 months. Yalla does not issue cash refunds for any services.",
        ],
      },
      {
        heading: "Club Yalla Memberships",
        paragraphs: [
          "Club Yalla memberships require 30 days’ written notice to cancel. Notice can be submitted through your Family Portal or by email. Your membership will remain active throughout the 30-day notice period.",
        ],
      },
      {
        heading: "Play Pass Memberships",
        paragraphs: ["Play Pass memberships also require 30 days’ notice to cancel. Cancellations can be managed directly through the Yalla app."],
      },
      {
        heading: "Final Membership Payments",
        paragraphs: [
          "For both Club Yalla and Play Pass memberships, regular billing will continue throughout the 30-day notice period. If your cancellation takes effect partway through a month, a final prorated payment will be charged on the first of that month, covering only the days leading up to your membership’s cancellation date.",
        ],
      },
    ],
  },
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
