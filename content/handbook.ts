/**
 * The Yalla Family Handbook (2026–2027), as it lives in the Family Portal at /portal/handbook.
 *
 * Adapted from Yalla's Parent/Caregiver Handbook 2026, which was written for Club Yalla, and widened so
 * every main section reads true for anyone at Yalla (Club Yalla, Yalla Flex, Camp Yalla and Happenings).
 * Where a program works differently, the section carries a note for that program.
 *
 * Where the PDF and Yalla's current website policies disagreed, the website's approved policies win
 * (late fees, medication, lost items, photography, cancellations, phone number), and closures follow the
 * booking calendar. Body text uses the same light markup as the FAQ: blank line between paragraphs,
 * "- " lists, **bold** and [links](/path).
 */

export type HandbookProgram = "club" | "flex" | "camp" | "happenings";

export const HANDBOOK_PROGRAMS: { key: HandbookProgram; name: string; short: string; line: string }[] = [
  { key: "club", name: "Club Yalla", short: "Club Yalla", line: "Our weekday membership, with a cohort and care team all year." },
  { key: "flex", name: "Yalla Flex", short: "Flex", line: "Drop-in childcare and coworking, booked by the day." },
  { key: "camp", name: "Camp Yalla", short: "Camp", line: "Seasonal camp days for children 18 months to 10 years." },
  { key: "happenings", name: "Yalla Happenings", short: "Happenings", line: "Immersive Play, weekend play, After Hours evenings and pop-ups." },
];

export type HandbookSection = {
  id: string;
  title: string;
  /** One or two sentences: the short answer. */
  summary: string;
  /** The numbers worth remembering (times, fees, limits), shown as boxes. */
  facts?: { value: string; label: string }[];
  body: string;
  /** Extra detail for one program. */
  programs?: Partial<Record<HandbookProgram, string>>;
  /** Only part of these programs (omit when it's for everyone). */
  appliesTo?: HandbookProgram[];
  /** Ways families might ask about this, to help "Ask the handbook" find it. */
  ask?: string[];
};

export type HandbookChapter = {
  id: string;
  number: string;
  title: string;
  /** Short line for the chapter card. */
  blurb: string;
  sections: HandbookSection[];
};

export const HANDBOOK_YEAR = "2026–2027";

const PHONE = "619.775.4008";
const HELLO = "[hello@yallaspacesd.com](mailto:hello@yallaspacesd.com)";
const MEMBERSHIP = "[membership@yallaspacesd.com](mailto:membership@yallaspacesd.com)";
const ADMIN = "[admin@yallaspacesd.com](mailto:admin@yallaspacesd.com)";
const ILLNESS = "[Illness Policy](/portal/illness-policy)";

export const HANDBOOK: HandbookChapter[] = [
  /* ─────────────────────────── 1. Welcome ─────────────────────────── */
  {
    id: "welcome",
    number: "01",
    title: "Welcome to Yalla",
    blurb: "Who we are, what we believe, and how to use this handbook.",
    sections: [
      {
        id: "welcome-letter",
        title: "A letter to our families",
        summary: "Yalla is a Reggio-inspired, play-based, child-led community designed to honor the wonder of early childhood.",
        body: `Dear Families,

Welcome to Yalla! Our program is a Reggio-inspired, play-based, child-led community designed to honor the wonder of early childhood. At Yalla, we merge the best practices in early childhood neurodevelopment with the rich traditions of the Reggio Emilia Approach, creating an environment where children’s voices, interests and curiosities guide the learning journey.

Our goal is to offer children play and inquiry-based experiences that nurture individual passions, cultivate critical thinking, and empower them to make meaningful contributions in and beyond their communities. At Yalla, children are encouraged to see themselves not only as learners but also as capable citizens who can shape the world around them.

Whether you’re with us every weekday, for a Flex day here and there, a camp day or an evening Happening, thank you for entrusting us with your child. We are honored to be part of this chapter of growth, exploration and discovery.

Warmly,
Team Yalla`,
        ask: ["what is yalla", "philosophy", "reggio emilia", "approach"],
      },
      {
        id: "commitments",
        title: "Our core commitments",
        summary: "Eleven commitments shape every Yalla day, from relationships and play to nature and the whole child.",
        body: `- **Reciprocal relationships**: learning flourishes through strong, respectful connections between children, educarers and guides, families and the wider community.
- **Play as the work of the child**: play is the natural medium of growth and discovery, a chance to explore, imagine, problem-solve and create.
- **Diversity, equity and inclusion**: we are fundamentally committed to a community where every child and family feels valued, respected and celebrated.
- **The environment as the third teacher**: our play spaces and outdoor areas are intentionally designed to invite exploration, creativity and collaboration.
- **Documentation as reflection**: we make children’s learning visible through careful observation and documentation, supporting growth, dialogue and shared understanding with families.
- **The image of the child**: we honor every child as capable, curious and full of potential, approaching their ideas with respect and care.
- **Continuity of care and attachment**: secure, consistent relationships are the foundation for trust, belonging and healthy development.
- **Collaboration and co-construction**: children, educarers and guides, and families build knowledge together through inquiry and shared problem-solving.
- **Connection to nature**: we nurture children’s innate connection to the natural world, fostering wonder, stewardship and responsibility for the environment.
- **Holistic development**: we support the whole child (social, emotional, cognitive and physical), understanding that each area of growth is deeply interconnected.`,
        ask: ["values", "beliefs", "what do you believe"],
      },
      {
        id: "using-this-handbook",
        title: "How to use this handbook",
        summary: "Everything here applies to every family at Yalla, unless a section says otherwise. Choose your program at the top to see the details that apply to you.",
        body: `This handbook is for every family at Yalla: Club Yalla members, Yalla Flex families, Camp Yalla campers and Happenings guests. The main text of each section applies to everyone. Where a program works differently, you’ll find a short note for that program underneath.

Choose your program at the top of the page and we’ll highlight the notes that apply to you. You can also ask the handbook a question in your own words. If the answer isn’t here, you can send your question straight to Team Yalla.

The handbook sits alongside our [Policies & Terms](/policies), the ${ILLNESS} and, for Yalla Flex, your Flex admission agreement. If anything here ever seems to disagree with an agreement you’ve signed, the signed agreement applies, and we’d be grateful if you let us know.`,
        programs: {
          club: "Club Yalla is our year-round weekday membership. Your child belongs to a cohort with a consistent care team, and day-to-day communication, sign-in and tuition happen through Brightwheel.",
          flex: "Yalla Flex is childcare and coworking by the day, booked in the Family Portal when a spot opens in your child’s age group. Before your first Flex day you’ll sign a Flex admission agreement, which stays on file for one year.",
          camp: "Camp Yalla runs on selected days when Yalla is otherwise closed, 9:00am to 3:00pm, for children 18 months to 10 years in three age groups. Camp days are booked in the Family Portal.",
          happenings: "Happenings are our Immersive Play Sessions, Weekend Play Sessions, After Hours evenings, pop-ups and gatherings. Each is booked in the Family Portal, and each listing shows its own ages, times and price.",
        },
        ask: ["which program", "difference between programs", "club vs flex"],
      },
    ],
  },

  /* ─────────────────────────── 2. Contact ─────────────────────────── */
  {
    id: "contact",
    number: "02",
    title: "Staying in touch",
    blurb: "How to reach us, who to ask, and how we keep you in the loop.",
    sections: [
      {
        id: "contacting-yalla",
        title: "Contacting Yalla",
        summary: `Call ${PHONE} or email ${HELLO}. We’re at 408 Nutmeg Street, San Diego, CA 92103.`,
        facts: [{value: "619.775.4008", label: "Call us"}, {value: "72 hours", label: "We reply to every email within"}],
        body: `**Yalla Coworking & Childcare**
408 Nutmeg Street, San Diego, CA 92103

- **Phone**: ${PHONE}
- **General questions**: ${HELLO}
- **Memberships** (Club Yalla and Play Pass changes and cancellations): ${MEMBERSHIP}
- **Operations**: ${ADMIN}
- **Website**: [yallaspacesd.com](https://www.yallaspacesd.com)
- **Instagram and Pinterest**: @yallaspacesd

If you’re running late or something is urgent on the day, please call rather than email so our team hears from you right away.`,
        programs: {
          club: "Club Yalla families also have Yalla’s emergency line, 626.633.7483, and can message their child’s care team directly in Brightwheel.",
        },
        ask: ["phone number", "email address", "how do i contact", "call yalla", "address", "where are you located"],
      },
      {
        id: "getting-here",
        title: "Getting here and parking",
        summary: "We’re at 408 Nutmeg Street in San Diego. Our parking guide covers free park-and-walk lots, meters, discounted monthly spots and our driveway policy.",
        body: `Yalla is at **408 Nutmeg Street, San Diego, CA 92103**.

Our [Parking guide](/parking) has everything you need: free park-and-walk lots, metered parking, discounted monthly spots and our driveway policy.`,
        ask: ["where do i park", "parking", "driveway", "directions", "address"],
      },
      {
        id: "who-to-ask",
        title: "Who to ask",
        summary: "Your child’s educarers and guides for day-to-day care; our leadership team for bigger questions and concerns; our operations team for bookings and billing.",
        body: `- **Your child’s educarers and guides**: the people who know your child’s day best.
- **Our leadership team**: program questions, concerns, dietary accommodations, custody paperwork and anything you’d like to talk through. ${HELLO}
- **Our operations team**: bookings, billing and the practical side of your time at Yalla. ${ADMIN}

Our educarers care for Seedlings and Saplings, our youngest children; our guides care for Sprouts and Wildflowers.`,
        programs: {
          club: "Your child’s cohort has its own care team for the year, and you can message them anytime in Brightwheel.",
          flex: "On Flex days your child joins the group for their age, cared for by that group’s educarers or guides. A team member will introduce you when you arrive.",
          camp: "Each camp age group has its own guides. You’ll meet them at arrival.",
          happenings: "Each Happening is led by Yalla guides, who’ll greet you at arrival.",
        },
        ask: ["who is the director", "who do i talk to", "staff", "teachers", "educarers", "guides", "care team"],
      },
      {
        id: "communication",
        title: "How we communicate",
        summary: "Messages for anything that needs attention today; email for everything else. We reply to emails within 72 hours.",
        facts: [{value: "Today?", label: "Message or call for anything time-sensitive"}, {value: "72 hours", label: "Email reply time, at most"}],
        body: `Close collaboration between families and the people caring for your child makes children’s days better, so communication matters deeply to us.

- **For anything time-sensitive** (a change to departure time, a feeding or diapering update, an absence today or tomorrow), message or call us so the team knows right away.
- **For anything less urgent** (an upcoming family trip, a question about your child’s development, or a request to meet with the care team), email ${HELLO}. We respond to all emails within 72 hours.

We share upcoming closures and community news by email and with signs in our lobby.`,
        programs: {
          club: "Use **Brightwheel messaging** for anything your child’s care team should know today. Brightwheel is also where you sign your child in and out, pay tuition, see photos and follow rest and diapering.",
          flex: `Your bookings, receipts and forms live in the [Family Portal](/portal/home). For anything on the day, tell the team at arrival or call ${PHONE}.`,
          camp: `Your camp bookings live in the [Family Portal](/portal/home). On camp days, call ${PHONE} for anything urgent.`,
          happenings: `Your bookings live in the [Family Portal](/portal/home). During a Happening, call ${PHONE} if you need to reach us.`,
        },
        ask: ["brightwheel", "message the teacher", "how long to reply", "response time", "email response"],
      },
    ],
  },

  /* ─────────────────────────── 3. Calendar ─────────────────────────── */
  {
    id: "calendar",
    number: "03",
    title: "Hours & calendar",
    blurb: "When we’re open, when we’re closed, and our quiet hours.",
    sections: [
      {
        id: "hours",
        title: "Hours by program",
        summary: "Weekday care runs 8:30am–4:30pm (half days to 12:00pm). Camp runs 9:00am–3:00pm. Each Happening lists its own times.",
        facts: [{value: "8:30–4:30", label: "Full days · Club Yalla & Flex"}, {value: "8:30–12:00", label: "Half days · Club Yalla & Flex"}, {value: "9:00–3:00", label: "Camp days"}, {value: "8:00am", label: "Early Bird, where offered"}],
        body: `Yalla is open Monday to Friday, except for holidays and family breaks. Hours depend on what you’ve booked:

- **Club Yalla and Yalla Flex**: full days 8:30am – 4:30pm; half days 8:30am – 12:00pm. Early Bird care from 8:00am where offered.
- **Camp Yalla**: 9:00am – 3:00pm, with an optional Early Bird from 8:00am and a late stay until 4:30pm.
- **Immersive Play Sessions**: 9:00am – 12:00pm.
- **Weekend Play Sessions**: 9:00am – 12:00pm or 1:00 – 4:00pm.
- **After Hours Evenings**: 5:00 – 9:00pm.
- **Pop-ups and gatherings**: times are listed with each event.`,
        programs: {
          club: "Early Bird care runs 8:00 – 8:30am. Please arrange it with us in advance.",
          flex: "Flex bookings for a day close at 8:00am that morning. Early Bird (8:00 – 8:30am, $16, for children 12 months and older) can be added when you book, on days we offer it.",
          camp: "Early Bird runs 8:00 – 9:00am ($20) and the late stay 3:00 – 4:30pm ($30), per child per day. Add them when you book.",
        },
        ask: ["what time do you open", "what time do you close", "what time does it end", "when does the day finish", "opening hours", "half day hours", "early bird", "extended care", "what time does camp start"],
      },
      {
        id: "closures",
        title: "2026–2027 calendar and closures",
        summary: "The 2026–2027 cohort year runs August 3, 2026 to July 21, 2027. We close for federal holidays and a few family breaks.",
        facts: [{value: "Aug 3", label: "First day of 2026–27"}, {value: "Nov 25–27", label: "Fall Family Break"}, {value: "Dec 21–Jan 1", label: "Winter Family Break"}, {value: "Jul 21", label: "Last day · half day"}],
        body: `Our 2026–2027 cohort year runs from **Monday, August 3, 2026** to **Wednesday, July 21, 2027**. We’ll remind families of upcoming closures by email and with signs in our lobby.

- **August 3, 2026**: first day of the cohort year
- **September 7, 2026**: Labor Day, closed
- **October 9, 2026**: Staff Development Day, closed
- **October 12, 2026**: Indigenous Peoples’ Day, closed
- **November 11, 2026**: Veterans Day, closed
- **November 25 – 27, 2026**: Fall Family Break, closed
- **December 21, 2026 – January 1, 2027**: Winter Family Break, closed
- **January 18, 2027**: Martin Luther King Jr. Day, closed
- **February 15, 2027**: Presidents Day, closed
- **April 16, 2027**: Staff Development Day, closed
- **May 31, 2027**: Memorial Day, closed
- **June 13, 2027**: Yalla Exhibition Event, 9:00am – 12:00pm
- **July 5, 2027**: Fourth of July, closed
- **July 21, 2027**: last day of the cohort year, half day
- **July 22 – 30, 2027**: Summer Family Break
- **August 2, 2027**: first day of the 2027–2028 cohort year`,
        programs: {
          flex: "Flex isn’t available on closure days; the booking calendar shows them as “Yalla closed”.",
          camp: "Camp Yalla runs on some of these closure days: November 11, 25 and 27; December 21, 22, 23, 28, 29 and 30; January 18; February 15; and July 5. When camp runs, the booking calendar says so.",
          happenings: "Some Happenings take place on weekends, evenings or closure days. Each is listed in the booking calendar.",
        },
        ask: ["holidays", "closed days", "when are you closed", "thanksgiving", "winter break", "summer break", "first day", "last day", "calendar", "is yalla open on"],
      },
      {
        id: "quiet-hours",
        title: "Quiet hours",
        summary: "While children rest, please don’t knock on doors. Saplings 11:45am–2:30pm; Sprouts and Wildflowers 12:15–3:00pm.",
        facts: [{value: "11:45–2:30", label: "Saplings"}, {value: "12:15–3:00", label: "Sprouts & Wildflowers"}, {value: "Anytime", label: "Seedlings families may drop in"}],
        body: `Rest time is precious. During each group’s quiet hours, please don’t knock on doors, so we don’t wake resting children or disturb those settling in or waking up. If you need to collect your child during quiet hours, a team member will bring your child and their belongings to the front door.

- **Seedlings**: quiet hours don’t apply, because families may drop in at any time. Please follow the sign on the rest-room door and use the main entrance whenever it’s displayed.
- **Saplings**: 11:45am – 2:30pm
- **Sprouts**: 12:15 – 3:00pm
- **Wildflowers**: 12:15 – 3:00pm`,
        programs: {
          club: "During quiet hours, send anything about arrival, departure or feeding to your child’s care team in Brightwheel rather than knocking.",
          flex: "Flex children rest with their age group and follow the same quiet hours.",
        },
        appliesTo: ["club", "flex"],
        ask: ["nap time knock", "can i visit during nap", "quiet time"],
      },
    ],
  },

  /* ─────────────────────────── 4. Booking & paying ─────────────────────────── */
  {
    id: "joining",
    number: "04",
    title: "Joining, booking & paying",
    blurb: "Enrollment, bookings, tuition, cancellations and your Yalla Wallet.",
    sections: [
      {
        id: "booking",
        title: "Booking with Yalla",
        summary: "Flex days, camp days and Happenings are booked and paid for in the Family Portal. Club Yalla is a membership you apply for.",
        facts: [{value: "10% off", label: "Each additional sibling, same day"}, {value: "12 hours", label: "Your place is held if a payment fails"}, {value: "8:00am", label: "Flex booking closes that morning"}],
        body: `Yalla programming and coworking are available by reservation. Before you book, please check the dates, times, age requirements, parent-presence requirements and what’s included.

A reservation is confirmed once you receive your booking confirmation and any payment is complete. Each child attending must be included in the reservation; a spot is for one child.

**Siblings**: when you book more than one child for the same program on the same day, 10% comes off each additional child automatically.

**If a payment doesn’t go through**, your place is held for 12 hours so you can sort it out. After that, it’s released to other families.`,
        programs: {
          club: `Club Yalla is a membership rather than a booking. Apply at [yallaspacesd.com/apply](/apply); see “Enrolling in Club Yalla” below. Club Yalla tuition is never charged through the Family Portal: it’s invoiced through Brightwheel.`,
          flex: "Flex days open when there’s a vacancy in your child’s age group. Choose full or half days (and Early Bird, where offered) before checkout. Bookings for a day close at 8:00am that morning.",
          camp: "Book the camp days that suit your family. Your child is placed in the right age group automatically from their date of birth.",
          happenings: "Each Happening shows its ages, times and price in the booking calendar. Some, like After Hours Evenings, have their own sibling pricing, applied automatically.",
        },
        ask: ["how do i book", "how to reserve", "sibling discount", "payment failed", "card declined", "how much does it cost"],
      },
      {
        id: "club-enrollment",
        title: "Enrolling in Club Yalla",
        summary: "Children can join from 4 months. Enrollment is year-round from our waitlist; offers are held for 3 business days.",
        facts: [{value: "4 months", label: "Youngest age to start"}, {value: "3 business days", label: "To accept an offer"}],
        appliesTo: ["club"],
        body: `Children are eligible for Club Yalla from 4 months of age. Enrollment is year-round: families may apply at any time, and children are admitted on a rolling basis as space opens.

Our waitlist stays open all year, so we encourage you to apply early. When a space opens, we offer it in waitlist order, applying our enrollment priority:

- Children of Yalla staff
- Siblings of currently enrolled Yalla children
- Siblings of previously enrolled Yalla children
- The general public

If we offer you a space, you have **3 business days** to accept before it’s offered to the next family. Infants under 4 months may join the waitlist, but care can’t begin until they turn 4 months.

All enrolled children must be able to benefit from an inclusive group care setting. If, after collaborative discussion, we find Yalla isn’t the right fit for a child’s needs, we’ll do everything we can to connect the family with resources and programs better suited to their child.`,
        ask: ["waitlist", "how to enroll", "priority", "how old to start", "minimum age"],
      },
      {
        id: "club-paperwork",
        title: "Club Yalla paperwork",
        summary: "Within 7 days of an offer: the enrollment questionnaire, admissions agreement and $125 registration fee. Within 30 days of starting: a health assessment and immunization record.",
        facts: [{value: "7 days", label: "To complete enrollment after an offer"}, {value: "$125", label: "Registration fee, non-refundable"}, {value: "30 days", label: "To send health and immunization records"}],
        appliesTo: ["club"],
        body: `**Within 7 days of an offer**:
- Complete the Enrollment Questionnaire
- Sign the Digital Admissions Agreement and Onboarding Packet (sent by DocuSign)
- Pay the **$125 non-refundable registration fee** (sent through Brightwheel)

**Before your child’s first day**, we must have on file:
- A completed Enrollment Questionnaire
- A signed Admissions Agreement
- All required forms from the Onboarding Packet

**Within 30 days of your child’s first day**:
- A health assessment completed by a licensed physician
- A record of immunization, or a complete and valid exemption form (these are rare and must be verified)

> Under state law, a child whose file is incomplete must be excluded from care until the missing documents arrive. This is strictly enforced, so thank you for keeping your child’s records current.`,
        ask: ["registration fee", "forms needed", "immunization", "vaccines", "health assessment", "doctor form", "paperwork"],
      },
      {
        id: "club-tuition",
        title: "Club Yalla tuition",
        summary: "Tuition is due on the 1st of each month, invoiced through Brightwheel. Biweekly or weekly plans are available (+3%), and prepaying 3 or 6 months saves 3% or 6%.",
        facts: [{value: "The 1st", label: "Tuition due each month"}, {value: "+3%", label: "Biweekly or weekly plans"}, {value: "3% · 6%", label: "Off when you prepay 3 or 6 months"}, {value: "$20/day", label: "Late tuition fee"}],
        appliesTo: ["club"],
        body: `Tuition is due in full on or before the **1st of each month**, invoiced in advance through Brightwheel. See [Membership rates](/membership) for tuition by cohort and schedule.

**Starting mid-month**: the first month is prorated. For example, $2,400 tuition with 20 care days is $120 a day, so starting on the 15th with 10 care days left, your first month is $1,200.

**Payment plans** (chosen in your Admission Agreement; monthly if you don’t choose):
- **Monthly**: one payment, due on the 1st.
- **Biweekly**: two equal payments a month, on the first and third Friday, plus 3%.
- **Weekly**: four equal payments, each Friday, plus 3%.

**Prepay and save**:
- **3 months**: 3% off, paid in full by the first day of the period.
- **6 months**: 6% off, paid in full by the first day of the period.

**Changing your plan**: email [hello@yallaspacesd.com](mailto:hello@yallaspacesd.com). We’ll send an updated agreement, and the change starts with the next billing cycle.

> Tuition not paid by the due date incurs a $20 late fee per day unless we’ve made arrangements together. After two weeks unpaid without communication, enrollment may be suspended or ended. We’re always glad to help, so please reach out.`,
        ask: ["tuition due", "monthly payment", "payment plan", "prepay discount", "late tuition fee", "proration", "how is tuition charged"],
      },
      {
        id: "club-withdrawal",
        title: "Continuity of care and leaving Club Yalla",
        summary: `Club Yalla needs 30 days’ written notice to ${MEMBERSHIP}. Memberships can’t be paused.`,
        facts: [{value: "30 days", label: "Written notice to leave"}, {value: "No pauses", label: "Club Yalla memberships can’t be paused"}],
        appliesTo: ["club"],
        body: `We strongly encourage continuity of care. When children grow through the program with familiar peers and educarers, they enjoy more secure attachment, emotional stability and stronger developmental outcomes. Consistency of care is one of the most valuable gifts we can offer young children.

We understand that circumstances change. To leave Club Yalla, please give **30 days’ written notice** by email to ${MEMBERSHIP}. Your membership stays active, and billing continues, through the notice period; we’ll confirm your end date and any remaining charges in writing.

Once notice is given, your child’s spot is offered to the next family on our waitlist and can’t be held beyond their final day. **Club Yalla memberships can’t be paused.** Re-enrolling later means a new application, subject to availability.

See [canceling a membership](/policies#canceling-a-membership) for how final payments are prorated.`,
        ask: ["withdraw", "cancel membership", "leave yalla", "notice period", "pause membership", "take a break"],
      },
      {
        id: "cancellations",
        title: "Cancellations and your Yalla Wallet",
        summary: "Cancel at least 24 hours ahead and the amount paid goes to your Yalla Wallet as credit, valid for 24 months. No-shows aren’t eligible.",
        facts: [{value: "24 hours", label: "Notice for a Wallet credit"}, {value: "24 months", label: "How long credits last"}, {value: "+5%", label: "Extra credit if Yalla cancels"}],
        appliesTo: ["flex", "camp", "happenings"],
        body: `**Cancel at least 24 hours ahead**: the amount paid goes back to your family’s **Yalla Wallet** as a credit, to use on any future Yalla booking for up to 24 months. Later cancellations and no-shows aren’t eligible for credit, and Yalla doesn’t give cash refunds for family cancellations, except where required by law.

> We would always rather a child stay home and rest than come to Yalla unwell. Illness and other extenuating circumstances may be exempt from the 24-hour rule, so just contact us as soon as you can.

**How to cancel**: in the [Family Portal](/portal/home), by phone at 619.775.4008, or by email to [hello@yallaspacesd.com](mailto:hello@yallaspacesd.com).

**If Yalla cancels or changes your reservation**, you choose:
- **Wallet credit plus 5%**: the full value of your booking, plus a thank-you for your flexibility.
- **A full refund**: back to your original payment method, processed within 7 business days.`,
        programs: {
          flex: "Repeated no-shows or cancellations without timely communication may lead to a temporary pause on Flex booking.",
        },
        ask: ["cancel booking", "refund", "credit", "wallet", "no show", "sick and can't come", "cancel because sick", "yalla cancelled"],
      },
      {
        id: "flex-agreement",
        title: "The Flex admission agreement",
        summary: "Signed online before your first Flex day; it stays on file for a year, or until your child moves to another Flex age group.",
        facts: [{value: "1 year", label: "Stays on file"}, {value: "Once", label: "Per Flex age group"}],
        appliesTo: ["flex"],
        body: `Before your child’s first Flex day, you’ll sign the Yalla Flex admission agreement for their age group (Seedlings, Saplings, Sprouts or Wildflowers) as part of checkout. It includes your initials on a few key sections and a drawn signature.

The agreement covers any Flex sessions you book for that age group and doesn’t commit you to future care. A new agreement is needed only when your child moves to another Flex age group, or one year after signing, whichever comes first. We won’t ask you to sign again before then.`,
        ask: ["flex agreement", "contract", "sign again", "admission agreement"],
      },
    ],
  },

  /* ─────────────────────────── 5. Groups ─────────────────────────── */
  {
    id: "groups",
    number: "05",
    title: "Groups & care teams",
    blurb: "Cohorts, age groups, ratios and who cares for your child.",
    sections: [
      {
        id: "cohorts",
        title: "Cohorts and age groups",
        summary: "Children spend their time at Yalla with others close to their age. Weekday care has four groups: Seedlings, Saplings, Sprouts and Wildflowers.",
        facts: [{value: "4", label: "Weekday age groups"}, {value: "August", label: "When Club Yalla cohorts move up"}],
        body: `At Yalla, children play and learn alongside others close to their own age, cared for by educarers and guides who know that stage of development well.

Our weekday care has four groups: **Seedlings** (our youngest), **Saplings**, **Sprouts** and **Wildflowers** (our oldest). Camp and some Happenings use their own age groups, described below.`,
        programs: {
          club: `Club Yalla children belong to a cohort for the whole cohort year. Rather than moving children as birthdays occur, we place each child in August based on their age at the start of the year, and they stay with the same peers and care team all year. Placement is by age alone, not by preference, friendships, siblings or previous care teams.

Starting ages vary a little from year to year, but are generally:
- **Seedlings**: about 11 months and younger
- **Saplings**: about 11 – 18 months
- **Sprouts**: about 18 months – 2½ years
- **Wildflowers**: about 2½ years and older

Children move to their new cohort each August. Over the summer, care teams prepare new environments and families hear about their child’s cohort, care team and what to bring. Cohorts still come together often for shared experiences, outdoor exploration, celebrations and community gatherings.`,
          flex: `Flex days are booked by age group, using your child’s age on the day:
- **Seedlings**: 4 – 12 months
- **Saplings**: 12 – 20 months
- **Sprouts**: 20 – 35 months
- **Wildflowers**: 3 – 4 years

Flex fills vacancies, so availability depends on openings in your child’s group.`,
          camp: `Camp days have three age groups: 18 months – 3 years, 4 – 6 years and 7 – 10 years.`,
          happenings: `Immersive Play Sessions are for children 3 – 8 years. Weekend Play Sessions and After Hours Evenings are for 18 months – 10 years, in separate age groups. Pop-ups list their own ages.`,
        },
        ask: ["what group is my child in", "cohort placement", "age groups", "move up", "transition to new cohort", "seedlings", "saplings", "sprouts", "wildflowers"],
      },
      {
        id: "ratios",
        title: "Ratios",
        summary: "Low adult-to-child ratios: 1:4 for Seedlings and Saplings, 1:6 for Sprouts and 1:8 for Wildflowers.",
        facts: [{value: "1:4", label: "Seedlings & Saplings"}, {value: "1:6", label: "Sprouts"}, {value: "1:8", label: "Wildflowers"}],
        body: `Young children thrive where they are seen, supported and known. We keep low adult-to-child ratios to support safe, responsive, relationship-based care:

- **Seedlings**: 1 adult for every 4 children
- **Saplings**: 1 adult for every 4 children
- **Sprouts**: 1 adult for every 6 children
- **Wildflowers**: 1 adult for every 8 children

Our ratios reflect both regulatory best practice and our own standards for high-quality care.`,
        ask: ["ratio", "how many children per teacher", "group size", "how many kids"],
      },
      {
        id: "substitutes",
        title: "When a team member is away",
        summary: "We cover absences with familiar faces wherever possible. Every substitute is credentialed, background-checked and CPR/First Aid trained.",
        body: `Our team strives to be here every day. Occasionally, illness, personal matters, professional development or the unexpected keep someone away. When that happens:

- **Familiarity**: we make every effort to bring in someone who already knows the group and its routines.
- **Qualifications**: every substitute is fully credentialed, cleared through background checks and trained in CPR and First Aid.
- **Support**: the rest of the care team and our support staff stay closely involved throughout the day.
- **Continuity**: routines, rhythms and established practices continue as closely as possible, and substitutes can see each child’s care notes and important health information.

Staffing decisions are based on availability, credentials and the group’s needs, so families can’t request or decline particular substitutes. Substitutes may not always pass on updates directly, but the team will make every effort to share anything important.`,
        ask: ["substitute", "teacher absent", "teacher sick", "who covers"],
      },
    ],
  },

  /* ─────────────────────────── 6. A day at Yalla ─────────────────────────── */
  {
    id: "day",
    number: "06",
    title: "A day at Yalla",
    blurb: "Arrival, staying onsite, departure, daily rhythm and rest.",
    sections: [
      {
        id: "arrival",
        title: "Arrival",
        summary: "Use the front door code, close the door behind you, and sign your child in. Arriving after 9:15am? Send us a quick note.",
        facts: [{value: "Door code", label: "Close it behind you, every time"}, {value: "9:15am", label: "Arriving later? Send a quick note"}],
        body: `- **Building entry**: everyone enters with the front door code. Please don’t share it, and make sure the door closes and locks behind you every time.
- **Sign-in**: every child is brought by an approved adult and signed in on arrival.
- **Shoes off for little ones**: in Seedlings and Saplings, many little hands explore the floor, so help your child take off outdoor shoes at the door. You’re warmly welcome inside; just remove your shoes or use our complimentary shoe covers.`,
        programs: {
          club: "Your front door code comes in your welcome packet, and your room code from your child’s care team on their first day. Sign in with Brightwheel at the kiosk or on your phone. We have an open-door policy on arrival times: a consistent time each day helps your child, but we’re here when you arrive. If you’ll be later than 9:15am, please send a courtesy message with your expected arrival time.",
          flex: "Check in at the lobby kiosk. A team member will welcome you and walk you to your child’s group. Your booking starts at 8:30am (8:00am with Early Bird); a late arrival doesn’t extend the session.",
          camp: "Camp arrival is at 9:00am, or 8:00am with Early Bird. Check in at the lobby kiosk and a guide will welcome your child into their age group.",
          happenings: "Check in at the lobby kiosk a few minutes before your Happening begins. A late arrival doesn’t extend the session.",
        },
        ask: ["drop off", "door code", "building entry", "getting into the building", "sign in", "check in", "arriving late", "what time to arrive"],
      },
      {
        id: "staying-onsite",
        title: "Staying onsite",
        summary: "For Club Yalla and Yalla Flex, a parent or designated caregiver stays onsite all day. For camp and most Happenings, you’re free to go, as long as you stay reachable.",
        facts: [{value: "All day", label: "Onsite · Club Yalla & Flex"}, {value: "Reachable", label: "By phone · Camp & most Happenings"}],
        body: `Each program notes whether a parent or caregiver stays onsite.

**Why we ask you to stay**: Yalla is a license-exempt program under California Health and Safety Code §1596.792. For weekday care, that exemption depends on each child’s parent or designated guardian being on the premises, and immediately available, whenever their child is in care.

> It isn’t optional: leaving the premises during weekday care may end a family’s participation immediately, and puts the program’s exemption at risk.

**When you’re free to go**: for programs where you may leave, an authorized adult must stay reachable throughout the session and be able to collect the child if needed.`,
        programs: {
          club: "A parent or designated caregiver stays onsite during your child’s care, typically working from our coworking space.",
          flex: "A parent or designated caregiver stays onsite for the whole Flex session; coworking is included. You agree to this in Section 10 of your Flex admission agreement.",
          camp: "You don’t need to stay onsite during camp. Please keep your phone on and stay reachable in case we need you.",
          happenings: "You’re free to leave during Weekend Play Sessions and After Hours Evenings. At Immersive Play Sessions you’re welcome to stay and cowork (+$15) or head out. Pop-up listings say whether you stay.",
        },
        ask: ["do i have to stay", "can i leave", "parent onsite", "drop and go", "leave my child", "license exempt", "run errands"],
      },
      {
        id: "departure",
        title: "Departure and running late",
        summary: "Sign your child out at departure. After a 5-minute grace period, a late fee of $10 is charged for each additional 10 minutes.",
        facts: [{value: "5 min", label: "Grace period"}, {value: "$10", label: "For each additional 10 minutes"}, {value: "20 min", label: "Before we call emergency contacts"}],
        body: `Please sign your child out when you collect them, and plan to collect them by the end of their session.

**Late fees**: after a 5-minute grace period, a late fee of **$10 is charged for each additional 10 minutes**. The late fee isn’t an agreement to provide extra care.

> Running late? Call 619.775.4008 as soon as you know, so our team can plan. Letting us know doesn’t waive the fee.

**If we can’t reach you**:
1. 20 minutes after the session ends without word from you, we start calling the emergency contacts on file.
2. If no one can be reached within 90 minutes, we contact local authorities for help locating you, which may include a welfare check.

**Authorized adults only**: we release children only to parents or caregivers, or to adults you’ve authorized in advance. See “Who can collect your child”.`,
        programs: {
          club: "Sign your child out in Brightwheel at the kiosk or on your phone. Regular care ends at 4:30pm (12:00pm for half days). If you think you’ll be late, message or call the team right away.",
          flex: "Full days end at 4:30pm and half days at 12:00pm. Sign out at the lobby kiosk.",
          camp: "Camp ends at 3:00pm, or 4:30pm with the late stay. Sign out at the lobby kiosk.",
          happenings: "Please be on time at the end of each Happening, especially After Hours Evenings, which end at 9:00pm.",
        },
        ask: ["pick up", "late pick up", "late fee", "what if i'm late", "running late", "sign out", "collect my child"],
      },
      {
        id: "daily-rhythm",
        title: "Daily rhythm",
        summary: "Each group follows a predictable rhythm (indoor and outdoor play, snacks and meals, rest) so children feel secure.",
        body: `Predictability helps children feel safe. Each group follows its own version of a consistent daily rhythm: the order of the day, indoor and outdoor play, snacks and meals, and other key moments stay largely the same, while the activities within them change with the children’s interests.

A steady rhythm lets children feel secure and supported, so they can thrive in a day that is structured yet flexible.`,
        programs: {
          club: "You’ll receive your cohort’s Daily Rhythm at the start of the year, and it’s posted in each space.",
          flex: "Your child joins the rhythm of their age group for the day.",
          camp: "Camp days are built around a hands-on idea for children to explore: making, building, growing, getting messy and discovering.",
          happenings: "Immersive Play Sessions are three unhurried hours of deep play, with lunch together at 11:30am.",
        },
        ask: ["schedule", "what happens during the day", "routine", "typical day"],
      },
      {
        id: "rest",
        title: "Rest time",
        summary: "Infants rest on their own rhythm in cribs. Children 18 months and older have a quiet rest time on mats around 12:00–2:00pm.",
        facts: [{value: "12:00–2:00", label: "Rest time, 18 months and up"}, {value: "~20 min", label: "Then quiet activities if awake"}],
        appliesTo: ["club", "flex"],
        body: `**4 – 18 months**: no fixed schedule. Infants nap when they need to, or on the rhythm you’ve set at home. Between 12 and 18 months, we work with you on the move to one nap, 12:00 – 2:00pm, so children are ready to rest on a mat with their group by 18 – 24 months. Every child gets there at their own pace.

- **Cribs**: a breathable mattress and tight-fitted organic sheet, in a clean, quiet, darkened space.
- **Watched over**: monitored by sight and sound at all times, and physically checked every few minutes.
- **Safe sleep**: infants under 12 months who can’t yet roll from front to back unassisted sleep on their backs, and are gently returned to that position if they move.

**18 months – 4 years**: a quiet rest time from about 12:00 to 2:00pm, signaled by familiar cues: mats laid out after lunch, curtains closed, white noise on.

- **Most children sleep**: busy mornings make for easy rest.
- **Still awake?**: after about 20 minutes, children rest quietly on their mat with books or quiet activities.
- **Always close by**: a familiar adult stays in the rest space throughout.

**What to send**: Yalla provides each child’s mat and organic sheet. Please send a light blanket and, if your child uses one, a child-size pillow; we wash them regularly.`,
        ask: ["nap", "sleep", "nap schedule", "crib", "nap mat", "does my child have to sleep", "blanket"],
      },
    ],
  },

  /* ─────────────────────────── 7. Food ─────────────────────────── */
  {
    id: "food",
    number: "07",
    title: "Food & feeding",
    blurb: "Lunches, snacks, water, bottles, breastfeeding and dietary needs.",
    sections: [
      {
        id: "meals-snacks",
        title: "Meals and snacks",
        summary: "Families pack lunch every day. Yalla is nut-free, and only water is allowed to drink.",
        facts: [{value: "Nut-free", label: "All of Yalla"}, {value: "Water only", label: "To drink"}],
        body: `Please send your child with a nutritious, fully prepared lunch each day. Yalla is a **nut-free** environment, and water is the only drink allowed.

Snack and mealtimes vary by group and follow each group’s daily rhythm. Even when children eat only a little, we keep consistent mealtime routines to build comfort and healthy habits.`,
        programs: {
          club: "**Seedlings** families provide lunch and any snacks their child needs. **Saplings, Sprouts and Wildflowers** families provide lunch, and Yalla provides nutritious morning and afternoon snacks. Our monthly snack menu is posted on the family bulletin board.",
          flex: "Pack lunch for the day. Yalla provides snacks for children who eat solid foods, as set out in your Flex admission agreement. Infants need all bottles and food for the whole session.",
          camp: "Pack a lunch and a labeled water bottle each camp day. Check your booking confirmation for anything extra to bring.",
          happenings: "Immersive Play Sessions include lunch together at 11:30am, packed from home. Other Happenings note any food details in the listing.",
        },
        ask: ["lunch", "snacks", "do you provide food", "what to pack for lunch", "food", "menu", "juice"],
      },
      {
        id: "lunch-guidelines",
        title: "Packing a safe lunch",
        summary: "Send meals ready to eat: no nuts, sweets, sugary drinks, glass or choking hazards, and everything cut for your child’s age.",
        body: `Meals must arrive **ready to serve**: no chopping, peeling or seasoning needed. Our team doesn’t cook or change food.

**Not permitted in any lunch**:
- Nut products of any kind (peanut butter, almond butter, Nutella, trail mix and so on)
- Candy, chocolate, gum or dessert-style sweets
- Sugary drinks, including juice, soda, flavored milk and sports drinks (water only)
- Choking hazards: whole grapes, whole cherry tomatoes, whole hot dogs, large chunks of meat or cheese, popcorn, and raw carrots unless finely shredded or thinly sliced
- Glass containers or anything breakable

**Preparing food by age**:
- **Infants, 4 – 18 months**: soft, safe and mashable with gums or minimal teeth; pre-cut for infant-sized utensils; small, labeled containers. No honey, added salt or choking hazards.
- **Toddlers, 1 – 3 years**: bite-sized, pre-cut and soft enough to chew safely; nothing hard, sticky or crunchy; grapes and tomatoes quartered; hot dogs sliced lengthwise, then into small pieces.
- **Children, 2½ years and up**: more texture is fine, still cut into child-sized pieces; grapes and tomatoes halved or quartered; hot dogs and sausages sliced lengthwise; nothing that needs adult help to eat.

> If a child arrives without lunch or with food that isn’t safe, we may ask you to bring something suitable, and a child may be sent home without adequate food.

**A helpful tool**: the free features of the **Solid Starts** app give age-by-age guidance on preparing food safely.`,
        ask: ["what food is not allowed", "grapes", "nuts", "peanut butter", "choking", "candy", "cut food", "honey"],
      },
      {
        id: "storage-reheating",
        title: "Storage and reheating",
        summary: "Pack food in an insulated lunchbox with ice packs. Each space has a microwave; tell us in writing if you’d like meals reheated.",
        facts: [{value: "Ice packs", label: "Insulated lunchbox"}, {value: "Opt in", label: "Tell us in writing to reheat meals"}],
        body: `Pack food in an insulated lunchbox with ice packs, or in a thermos as needed.

Each space has a microwave, and you can choose whether your child’s meals are reheated. If you opt in, pack food in microwave-safe containers labeled with your child’s name, and let your child’s educarers or guides know your preference in writing.`,
        ask: ["microwave", "heat up lunch", "warm food", "ice pack", "thermos"],
      },
      {
        id: "water",
        title: "Water",
        summary: "Children have filtered water all day: bottles refilled from 6 months, cups at eye level from 12 months.",
        facts: [{value: "6 mo+", label: "Bottles refilled all day"}, {value: "12 mo+", label: "Cups at eye level"}],
        body: `Healthy hydration matters, so children have clean, filtered water all day.

- **6 months and up**: water bottles are refilled with filtered water throughout the day.
- **12 months and up**: cups sit at eye level to encourage independent drinking; our team reminds children to sip, and checks cups often so they’re never empty.

**What to send**: a labeled water bottle.`,
        ask: ["water bottle", "drinks", "hydration"],
      },
      {
        id: "breast-milk",
        title: "Breast milk",
        summary: "Bring breast milk chilled, in sealed bottles labeled with your child’s name and the date. We can store up to 25 ounces per child.",
        facts: [{value: "25 oz", label: "Most we can store per child"}, {value: "48 hours", label: "Refrigerated, at most"}, {value: "39°F", label: "Fridge temperature or below"}],
        body: `**Bringing it in**: clean, sealed containers labeled with your child’s name and the date it was expressed, kept cold on the way (on ice or in a cooler).

> We can’t accept breast milk in plastic bags or glass, in unsealed or unlabeled containers, or milk that has warmed to room temperature on the way.

**How we store it**:
- **Refrigerated**: at 39°F (4°C) or below, in a bin labeled for your child, for up to 48 hours.
- **Frozen**: labeled with the date it was frozen, at 0°F (-18°C) or below.
- **Space**: up to 25 ounces per child at a time.

**At feeding time**: we warm milk in a bottle warmer, never a microwave (which creates hot spots and destroys nutrients), and swirl it gently to mix. Anything left after a feeding is discarded.`,
        appliesTo: ["club", "flex"],
        ask: ["breastmilk", "bottles", "pumped milk", "frozen milk", "how much milk"],
      },
      {
        id: "formula",
        title: "Formula",
        summary: "Send pre-measured formula labeled with your child’s name, with mixing instructions, or ready-to-feed formula in its original packaging.",
        body: `Please send pre-measured formula in clean containers labeled with your child’s name. For powdered formula, include the right amount of powder in a separate container and tell us how many ounces of water each bottle needs. Ready-to-feed liquid formula can come in its original packaging, labeled with your child’s name.

Formula is stored in a designated area, and refrigerated at 39°F (4°C) or below if needed. We follow your mixing instructions using filtered water, and warm formula in a bottle warmer if you ask us to, never in a microwave.`,
        appliesTo: ["club", "flex"],
        ask: ["formula", "powdered formula", "mixing bottles"],
      },
      {
        id: "infant-feeding",
        title: "Infants not yet eating solids",
        summary: "Infants who are breast- or bottle-fed follow their own feeding schedule, then join the group’s meal rhythm once they start solids.",
        appliesTo: ["club", "flex"],
        body: `Infants who are exclusively breast- or bottle-fed follow an individual feeding schedule based on their needs. Once solid foods are introduced, they begin following their group’s meal rhythm. We build routines with our emerging eaters by offering snacks and meals at the same times each day, even if they eat only a little.`,
        ask: ["feeding schedule", "starting solids", "baby food"],
      },
      {
        id: "breastfeeding",
        title: "Breastfeeding",
        summary: "Nursing is welcome anywhere at Yalla, at any time and at any age, covered or uncovered. We also have private nursing quarters.",
        body: `Yalla fully supports breastfeeding, including extended breastfeeding, as developmentally appropriate and biologically normal. There’s no age limit.

**Where you can nurse**:
- **Anywhere in our shared spaces**: covered or uncovered, including the lobby and play spaces. Just choose a seat outside the background of anyone’s video call.
- **In your child’s space**: whenever it’s calm.
- **Our nursing quarters**: private, and open all day, including quiet hours.

**Nursing regularly?**: share your general schedule with your child’s caregivers so we can support you and the group’s rhythm.

> Breastfeeding is a legally protected right in California. No one in our community (team, parent or visitor) may express disapproval or discomfort toward a nursing parent in any way. Doing so is a serious breach of our community standards and may end a family’s participation.`,
        appliesTo: ["club", "flex"],
        ask: ["nursing", "breastfeed", "nursing room", "where can i nurse", "extended breastfeeding"],
      },
      {
        id: "special-diets",
        title: "Allergies and special diets",
        summary: "Tell us about allergies before your child attends. With a doctor’s note, we can offer alternative snacks; otherwise families send all food.",
        body: `Please tell us about any food allergies, intolerances or dietary needs, and any emergency care your child may need, before they attend. We take precautions but can’t guarantee an allergen-free environment, and we ask that children don’t share food.

If your child has a documented food allergy or intolerance, please provide both lunch and snacks from home. With written documentation from a licensed medical provider, Yalla can offer alternative snacks as a reasonable accommodation; please send it before your child’s first day so we can plan.

For children with special feeding needs, we keep a daily record of what they eat and share it with you as appropriate. Questions about accommodations? Email our leadership team at ${HELLO}.`,
        ask: ["allergy", "allergies", "gluten free", "dairy free", "vegan", "dietary restrictions", "epipen"],
      },
    ],
  },

  /* ─────────────────────────── 8. What to bring ─────────────────────────── */
  {
    id: "bring",
    number: "08",
    title: "What to bring & wear",
    blurb: "Packing lists, clothing, shoes, diapering and toileting.",
    sections: [
      {
        id: "families-provide",
        title: "What families provide",
        summary: "Yalla provides everything else, but please bring diapering supplies, clothing and comfort items, and food and drink.",
        facts: [{value: "2", label: "Complete spare outfits, always"}, {value: "Label", label: "Everything, especially outerwear"}],
        body: `Yalla provides what your child needs each day, apart from the items below and anything our team asks for ahead of a special event or project.

**Diapering** (as needed): diapers or pull-ups, wipes and diaper rash ointment.

**Clothing and accessories**:
- Outerwear (jackets, hats and so on)
- Swimwear and sun-protective clothing (a rash guard or sun shirt)
- At least two complete changes of clothes
- Indoor and outdoor shoes
- A sleep sack (under 18 months)
- A light blanket, lovey and/or small child-size pillow (for children who rest on mats); comfort items must be safe-sleep approved

**Food and drink** (as applicable): a water bottle, lunch, clean and sterilized bottles, and breast milk or formula (in bottles).

Please **label everything** with your child’s name, especially outerwear.`,
        programs: {
          club: "Keep your child’s cubby stocked; we’ll send a courtesy reminder in Brightwheel when supplies run low.",
          flex: "Bring everything your child needs for the session; it goes home with you at the end of the day. Every child should have a labeled water bottle, lunch box, light jacket and a spare outfit.",
          camp: "Send a labeled water bottle, lunch box, light jacket and one spare outfit, plus anything listed in your booking confirmation.",
          happenings: "Bring what the listing suggests; for most Happenings that’s a labeled water bottle and a spare outfit.",
        },
        ask: ["what to bring", "packing list", "what do i need to pack", "what to pack for camp", "what to bring to a happening", "supplies", "first day checklist"],
      },
      {
        id: "belongings",
        title: "Toys and belongings from home",
        summary: "Please leave toys and treasures at home. Lost items are kept for 60 days.",
        facts: [{value: "60 days", label: "Lost items are kept"}],
        body: `Please leave toys and treasures at home. Special objects can cause tension between children, and heartache if something goes missing. Anything brought from home waits in your child’s cubby until departure.

**Electronics**: kept switched off in your child’s cubby and never used during the day (augmentative communication devices excepted).

**Lost items**: we do our best, but can’t be responsible for lost or damaged belongings, so think twice before sending a beloved stuffed animal or blanket. Lost items are kept for up to 60 days; just ask. After that, they may be donated or added to Yalla’s collection.`,
        ask: ["toys from home", "lost and found", "lost item", "bring a toy", "tablet", "phone"],
      },
      {
        id: "clothing",
        title: "Clothing",
        summary: "Comfortable play clothes that can get messy, dressed in layers for the weather.",
        facts: [{value: "2", label: "Spare outfits, always"}, {value: "3 a day", label: "While potty training"}, {value: "72°F", label: "Indoors, year-round"}],
        body: `Children climb, crawl, run, jump and swing, so dress them in comfortable clothes that let them move freely.

- **Play clothes**: paint, mud, water and natural materials are all part of our days, so choose clothes that can get messy.
- **Layers**: dress for the forecast, in layers your child can adjust. Indoors stays around 72°F.
- **Spares**: at least 2 complete changes of clothes, always; at least 3 extra outfits a day while potty training.`,
        ask: ["what should my child wear", "clothes", "spare clothes", "messy play", "dress code"],
      },
      {
        id: "shoes",
        title: "Shoes",
        summary: "Children may go barefoot indoors, but every walking child needs well-fitting, closed-toe, easy-to-clean shoes.",
        body: `Children may be barefoot in their play spaces if they choose, but every child who walks needs a pair of **closed-toe, easy-to-clean shoes** at Yalla every day. Shoes should fit properly, neither too big nor too small.

Durable, easy-to-clean styles such as Crocs, Natives or similar rubber slip-ons work well. Expect shoes to get wet and dirty: outdoor play and exploration are an important part of our days.

If you’d like your child to enjoy the benefits of going barefoot outdoors, look for barefoot sandals, barefoot water shoes, barefoot sneakers or barefoot-sole shoes.`,
        ask: ["shoes", "crocs", "sandals", "barefoot", "closed toe"],
      },
      {
        id: "diapering",
        title: "Diapers, pull-ups and wipes",
        summary: "Bring an as-needed supply of diapers or pull-ups and wipes. Children over 30 months who aren’t potty trained use pull-ups.",
        facts: [{value: "30 months", label: "Pull-ups from here if not yet trained"}, {value: "Same day", label: "Soiled cloth diapers go home"}],
        body: `**Disposable diapers**: please supply diapers as needed. Bringing a sleeve at the start of each week works well for many families.

**Cloth diapers** are welcome, as long as the absorbent inner lining is completely contained within a waterproof outer cover, and both are changed as one unit. Soiled cloth diapers and clothing are placed in a plastic bag, without rinsing, and sent home that day for laundering.

**Pull-ups**: we ask that children over 30 months who aren’t yet potty trained wear pull-ups, for a simpler, more dignified change that supports their growing independence. Children are encouraged to help take off a wet pull-up and put on a new one.

**Wipes**: please supply wipes as needed.

During changes, our team washes hands and wears gloves, uses a clean, sanitized changing surface, and sanitizes it after every change.`,
        programs: {
          club: "Diaper changes for children under 18 months are logged in Brightwheel, so you can match your supply to how many are used. Your child’s educarer or guide will send a courtesy reminder when the supply runs low.",
          flex: "Bring enough diapers or pull-ups and wipes for the whole session.",
          camp: "Children in the 18 months – 3 years group who use diapers or pull-ups should bring enough for the day, plus wipes.",
        },
        ask: ["diapers", "pull ups", "wipes", "cloth diapers", "diaper cream"],
      },
      {
        id: "toileting",
        title: "Potty learning",
        summary: "We never rush potty learning. Children have access to a potty all day, and accidents are handled calmly and kindly.",
        body: `We support potty learning on each child’s own timeline. There’s no age by which children must be potty trained; readiness depends on nervous system maturity, muscle control, hormonal and brain development, psychological readiness and even sleep. Children can use a potty (and an optional toddler training seat) at any time, and accidents, which are common at this age, are handled swiftly and neutrally so children feel safe.

Please send **at least three extra outfits a day** while your child is potty training, and check their bag or cubby daily for clothes to wash.`,
        programs: {
          club: "When potty learning begins at home, please complete the Potty Learning Questionnaire and book a 15-minute conversation with your child’s care team, so we can follow the same approach at Yalla.",
          flex: "Let the team know at arrival if your child is potty learning and how you approach it at home.",
          camp: "Let us know at arrival if your child is potty learning or needs help in the bathroom.",
          happenings: "Let us know at arrival if your child needs help in the bathroom.",
        },
        ask: ["potty training", "toilet training", "accidents", "does my child need to be potty trained"],
      },
    ],
  },

  /* ─────────────────────────── 9. Guidance ─────────────────────────── */
  {
    id: "guidance",
    number: "09",
    title: "Guidance & growing together",
    blurb: "How we support behavior, conflict, biting and big feelings.",
    sections: [
      {
        id: "positive-guidance",
        title: "Positive guidance",
        summary: "Instead of punishment, we use guidance and redirection, helping children learn from mistakes and build social-emotional skills.",
        body: `One of our foundational goals is helping children develop strong social and emotional skills. Children with these skills tend to be happier, more motivated and more engaged, and better able to build positive relationships with adults and peers. Rather than discipline, we use guidance and redirection, helping children understand they can learn from mistakes, starting by showing them how.

- **Our environment**: engaging, age-appropriate materials, no long waits, and a rhythm flexible enough to follow children’s interests and needs.
- **Our team**: strong rapport with each child, calm voices (especially during redirection), help putting words to emotions, and social stories to teach healthy social skills.
- **Our families**: regular communication for consistency between home and Yalla, and connections to experts when that would help.

**Our techniques**:
- Modeling and teaching skills like sharing, taking turns and kind words, practiced through play
- Clear, consistent expectations, with positive behavior noticed and gentle reminders when needed
- Turn-taking supported with timers and visual cues
- Encouraging empathy through stories about feelings
- Close, engaged supervision that steps in early when conflict starts

We never use corporal punishment, and we never use psychological harm, coercion, threats, derogatory remarks, or withholding food as discipline. This applies to everyone on our premises, including parents, caregivers and authorized adults.`,
        ask: ["discipline", "behavior", "time out", "punishment", "how do you handle behavior", "redirection"],
      },
      {
        id: "behavior-concerns",
        title: "When behavior is a concern",
        summary: "We observe, teach skills, keep everyone safe and partner with you privately on a plan, including outside support if needed.",
        body: `Our team understands that children have a wide range of needs as they learn to be in the world. When a child shows challenging behavior, we follow the standards of the National Association for the Education of Young Children (NAEYC):

- Observe to understand what predicts or contributes to the behavior
- Teach social, communication and emotional regulation skills, and adapt the environment, activities and support
- Respond calmly and respectfully to keep everyone safe, telling the child what is and isn’t okay
- Document the behavior and the approaches we’ve tried
- Hold conversations with families in private, working as a team on an individual plan that supports the child’s inclusion and success
- Where helpful, connect families with professional services such as early intervention, community mental health or private therapists

If a child’s behavior repeatedly puts themselves or others in imminent danger, we will work with the family and outside specialists on a documented plan. If unsafe behavior persists despite that support, Yalla may recommend or require an alternative placement. For children with an IFSP or IEP, we follow all applicable special education rules and procedural safeguards.`,
        programs: {
          flex: "On Flex days, because you’re onsite, we may ask you to come and help your child, or to take them home early, if a situation can’t be safely supported.",
          camp: "If a situation can’t be safely supported during camp, we’ll call you, and may ask you to collect your child early.",
          happenings: "If a situation can’t be safely supported during a Happening, we’ll call you, and may ask you to collect your child early.",
        },
        ask: ["my child hits", "aggressive", "behavior plan", "meeting about behavior", "special needs", "iep"],
      },
      {
        id: "peer-conflict",
        title: "Peer conflict",
        summary: "Conflict is a normal part of growing up. We coach children through it, never punish it, and tell you about anything that causes an injury.",
        facts: [{value: "4 hours", label: "Incident report if a child is hurt"}],
        body: `For young children, learning to share space, communicate needs and manage big feelings is core to growing up. We see conflict as a developmental opportunity, not misbehavior. The part of the brain responsible for impulse control and empathy is still developing rapidly, so children often act (grabbing, pushing, biting) before they can find words. With skilled adult support, working through conflict builds resilience, empathy and the knowledge that relationships can be repaired.

**How we respond**:
1. **Watch and anticipate**: staying close and offering turn-taking timers, parallel play or words to use.
2. **Safety and co-regulation first**: calmly separating children if needed and offering a soothing presence, not punishment.
3. **Words for feelings**: “You were frustrated when the tower fell.”
4. **Repair**: checking on a friend, helping rebuild or saying sorry when ready. Repair is encouraged, never forced.
5. **Problem-solving**: inviting children to come up with solutions together.
6. **Modeling respect**: showing how to listen, take turns and validate feelings.

It’s developmentally typical for young children to take toys without asking, push or bite before they have other tools, find waiting hard, and express big feelings loudly. These don’t make a child “bad” or “mean”.

**What we’ll tell you**:
- **Everyday conflicts** that resolve with support: you may not get an immediate report, but we’ll share patterns and progress.
- **Conflicts causing injury** (scratches, bites or bruises): an incident report within 4 hours to the family of the child who was hurt.
- **Repeated or escalating conflicts**: we’ll work closely with you on consistent strategies, which may include a support plan or outside consultation.`,
        programs: {
          club: "Incident reports are sent through Brightwheel.",
          flex: "We’ll tell you in person if anything happens, since you’re onsite, and follow up in writing.",
        },
        ask: ["fighting", "my child was pushed", "another child hurt my child", "sharing", "conflict", "incident report"],
      },
      {
        id: "biting",
        title: "Biting",
        summary: "Biting is common in infants and toddlers. We comfort, redirect, look for the cause and tell both families the same day.",
        facts: [{value: "Same day", label: "Both families told, confidentially"}],
        body: `Biting is developmentally typical for infants and toddlers, especially during teething, rapid language growth or big emotions. We approach it through a restorative, developmentally informed lens while keeping every child safe.

**Our response**:
- Immediate care and comfort for the child who was bitten
- Calm redirection and regulation support for the child who bit
- Documentation and same-day communication with both families, keeping each child’s identity confidential
- Close observation to identify triggers and patterns
- Restorative practices, such as modeling gentle touch, helping with an ice pack, and practicing kind words
- Working with families on strategies to support regulation and reduce triggers

**If biting continues**, we may increase adult support, adjust the group’s rhythms and transitions, suggest a shorter or modified schedule, ask the child to stay home until a support plan is in place, or ask for outside support from a pediatrician, early intervention specialist or behavioral consultant. If biting continues to put others at risk after all of this, Yalla may end the child’s participation.`,
        ask: ["biting", "my child bites", "my child was bitten", "bite"],
      },
      {
        id: "suspension",
        title: "Our approach to suspension and expulsion",
        summary: "We don’t believe exclusion helps young children. Temporary removal is a rare last resort, with documentation and a plan for return.",
        body: `Every child deserves a safe, supportive and inclusive environment, and all children communicate through behavior. Following NAEYC’s recommendations, Yalla doesn’t consider suspension or expulsion best practice. Research shows exclusion harms young children over the long term, and early childhood programs expel children at far higher rates than K–12 settings.

Instead, we use evidence-based strategies, partner with families to understand root causes, seek outside consultation when needed, and use positive guidance, restorative practices and individual support.

Only in the most extreme and rare cases, when a child’s behavior is an ongoing, serious safety risk and everything else has been tried, would temporary removal be considered. If that happens, we’ll give you documentation of the support we’ve tried, resources, and a plan for your child’s return.

When Yalla ends a child’s participation, we refund the full remaining value of any unused prepaid sessions to the original payment method.`,
        ask: ["expelled", "suspended", "kicked out", "removed from program"],
      },
    ],
  },

  /* ─────────────────────────── 10. Health & safety ─────────────────────────── */
  {
    id: "health",
    number: "10",
    title: "Health & safety",
    blurb: "Illness, medication, injuries, emergencies and a healthy environment.",
    sections: [
      {
        id: "illness",
        title: "Illness",
        summary: `Keep your child home when they’re unwell. If they become ill at Yalla, we’ll separate them from the group and ask you to collect them within 20 minutes. Read the full ${ILLNESS}.`,
        facts: [{value: "20 min", label: "To collect a child who becomes ill"}, {value: "24 hours", label: "Symptom-free before returning"}],
        body: `For the health of our whole community, every family follows Yalla’s [Illness Policy](/portal/illness-policy) in full. It explains which symptoms mean staying home, when children can return, and how we communicate.

**Before returning**: children should be symptom-free for 24 hours.

**Tell us early**: if your child is sick or may have something contagious, let us know as soon as possible, so we can take extra sanitation precautions and tell other families about possible exposure.

> If your child becomes ill at Yalla, they’ll be cared for away from the group, and you (or another authorized adult) need to collect them **within 20 minutes** of our call.

Repeatedly not following the illness policy may lead to a pause or end to care, to protect other children, families and our team.`,
        programs: {
          club: "Message your child’s care team in Brightwheel if your child will be absent or may be contagious.",
          flex: "If your child is unwell on a booked day, cancel in the Family Portal or call us; illness may be exempt from the 24-hour notice for credit. If your child is sent home, the rest of that session is treated as an absence.",
          camp: "If your child is unwell on a camp day, call us; illness may be exempt from the 24-hour notice for credit.",
          happenings: "If your child is unwell, please stay home and let us know; illness may be exempt from the 24-hour notice for credit.",
        },
        ask: ["sick", "fever", "illness", "when can my child come back", "contagious", "vomiting", "cold", "cough", "runny nose"],
      },
      {
        id: "medication",
        title: "Medication and topical products",
        summary: "We don’t give medication, except emergency medication (like an EpiPen) and authorized topical products (like sunscreen or diaper cream).",
        facts: [{value: "2 exceptions", label: "Emergency medication · topical products"}, {value: "Form first", label: "Authorization on file before any use"}],
        body: `Yalla doesn’t give medication, with two exceptions:

- **Emergency medication**: such as an EpiPen.
- **Authorized topical products**: over-the-counter creams like diaper rash cream, sunscreen and ointments.

> A completed authorization form must be on file before our team gives any emergency medication or applies any topical product.

**Packaging**: original packaging, labeled with your child’s name, with instructions that match the form. Please hand products directly to a team member rather than leaving them in your child’s bag.

**What stays and what goes home**: EpiPens are the only medication we keep onsite, in a container labeled with your child’s name, with the authorization and emergency care instructions on file. Other authorized products come with your child each day and go home with them.`,
        programs: {
          club: "You can complete authorization forms, including sunscreen permission, in the [Family Portal](/portal/home).",
          flex: "Bring any authorized topical products, like sunscreen, each Flex day; they go home with you.",
        },
        ask: ["medicine", "medication", "tylenol", "antibiotics", "give my child medicine", "sunscreen", "diaper cream", "epipen", "inhaler"],
      },
      {
        id: "emergency-care",
        title: "Emergencies and injuries",
        summary: "In a medical emergency we call 911 and then you. A team member goes in the ambulance if you aren’t there.",
        body: `If a child needs urgent medical attention, our team will:

1. Assess the child’s condition and how serious it is
2. Call 911 if needed, with clear information about the child, location and first aid given
3. Contact you as soon as reasonably possible
4. Send a team member with your child in the ambulance if you aren’t present, along with their emergency contacts and medical information
5. Document everything and follow up with your family

Please keep your contact details and emergency contacts current so we can always reach you.`,
        ask: ["emergency", "ambulance", "hospital", "911", "serious injury"],
      },
      {
        id: "falls",
        title: "Falls, bumps and scrapes",
        summary: "Minor bumps are a normal part of active play. You’ll get a report within 4 hours, or within 30 minutes (plus a call if needed) for anything involving the head or face.",
        facts: [{value: "4 hours", label: "Report for a minor bump or scrape"}, {value: "30 min", label: "Report for head or face injuries"}],
        body: `As children learn to run, climb, balance and jump, occasional falls are a natural part of learning. Their balance, motor planning and sense of where their body is in space are all still maturing, and small tumbles help them judge risk, build resilience and grow more coordinated.

> Expect the occasional scrape, bump or bruise. They’re signs of active, healthy play.

**How we keep play safe**: active supervision, safe behavior modeled, and spaces prepared thoughtfully, removing unnecessary hazards while keeping meaningful challenge.

**How we’ll tell you**:
- **Mild injuries** (a scrape, bruise or bump not involving the head or face): an incident report with details and a photo within 4 hours.
- **Head, face, eyes, mouth or neck, or anything more serious**: a report within 30 minutes, plus a phone call if your child may need attention or medical care.

Every report covers what happened, how we responded and any first aid. We’ll also tell you about any later change in your child’s behavior or condition.`,
        programs: {
          club: "Incident reports are sent through Brightwheel.",
          flex: "Since you’re onsite, we’ll come and find you for anything more than a minor bump.",
        },
        ask: ["fell", "injury", "bump on head", "scrape", "bruise", "hurt", "accident report", "risky play"],
      },
      {
        id: "choking",
        title: "Preventing choking",
        summary: "Children always sit to eat with an adult close by. We check lunches for hazards, and our team is trained in pediatric first aid and CPR.",
        body: `Choking is a serious, preventable risk while children are still developing chewing and swallowing skills. Please prepare and cut food for your child’s stage (see “Packing a safe lunch”).

Our team is trained in pediatric first aid and CPR, including choking response. At every meal and snack:
- Children are always seated and supervised while eating
- We visually check lunches for obvious choking hazards
- High-risk foods (whole grapes, cherry tomatoes, hot dogs, large chunks of meat, hard raw vegetables, thick nut butters and other sticky textures) may be held back if they aren’t safe for your child
- We discourage walking, running or playing while eating

If a child shows signs of choking, our team begins the age-appropriate emergency response immediately, calls 911 if the airway isn’t cleared right away, contacts you as soon as it’s safe, and documents the incident.`,
        ask: ["choking", "cpr", "first aid trained"],
      },
      {
        id: "lice",
        title: "Head lice",
        summary: "Yalla has a no-live-lice policy. Children can return once treated and free of live lice, after a recheck by our team.",
        body: `Yalla has a **no-live-lice** policy, to keep lice from spreading.

1. If live lice are found during the day, we’ll call you for immediate collection.
2. Your child can return once treated and free of live lice; nits may still be present but must be significantly reduced and non-viable.
3. A team member rechecks your child before they rejoin their group.

**Help us catch it early**: check your child’s hair regularly and tell us promptly about any known or suspected exposure. We strongly recommend professional removal for a child with lice, and a professional head check for everyone at home. Hair Fairies in Rancho Peñasquitos, about 20 minutes north of Yalla, is a reliable option.`,
        ask: ["lice", "nits", "head lice"],
      },
      {
        id: "disasters",
        title: "Earthquakes, wildfires and severe weather",
        summary: "We have an emergency plan and practice drills. In severe weather, children stay safely with us; please don’t travel through flooding to reach them.",
        body: `Yalla has a comprehensive emergency plan, and we practice earthquake and fire drills regularly so children know what to do.

- **Earthquakes**: our team follows “Drop, Cover and Hold On”. Infants and toddlers are moved quickly to a safe spot, under a sturdy table or against an interior wall away from windows and heavy furniture. If we evacuate to a designated safe area, we’ll contact you as soon as possible.
- **Wildfires** (low risk here): we follow local authorities and are ready to evacuate to a designated shelter if instructed, telling families our location immediately. We use the Watch Duty app for current information.
- **Severe weather** (moderate risk): during heavy rain or flooding, children stay indoors, safe and cared for, for as long as needed.

> Please don’t travel through flooded areas to reach your child. Your child is safe inside with us, and the risk to you on the road is greater. Come when conditions improve, and call us anytime for updates.`,
        ask: ["earthquake", "fire", "wildfire", "flood", "rain", "emergency plan", "evacuation", "drills"],
      },
      {
        id: "health-emergencies",
        title: "Public health emergencies",
        summary: "We follow public health directives. If Club Yalla must close for an extended period of time, tuition isn’t charged for the closure.",
        body: `In a future pandemic, major outbreak or other public health crisis, Yalla follows every directive from local, state and federal public health authorities, using best practices to reduce risk and keeping families informed promptly and clearly.`,
        programs: {
          club: "If an emergency requires Yalla to suspend in-person care for an extended period of time, families won’t be charged tuition for the closure period.",
          flex: "If Yalla has to cancel booked sessions, you choose between Yalla Wallet credit plus 5% or a full refund.",
          camp: "If Yalla has to cancel a camp day, you choose between Yalla Wallet credit plus 5% or a full refund.",
          happenings: "If Yalla has to cancel a Happening, you choose between Yalla Wallet credit plus 5% or a full refund.",
        },
        ask: ["covid", "pandemic", "outbreak", "closure tuition"],
      },
      {
        id: "hygiene",
        title: "Handwashing and hygiene",
        summary: "Our team washes hands at every key moment, and children wash hands throughout the day as part of their rhythm.",
        body: `Every team member washes their hands on arrival, after using the restroom, changing a diaper, helping a child in the bathroom, or handling food or cleaning supplies.

Children wash their hands at set times each day, including after using the bathroom and before returning to play after snacks and meals, building healthy habits that keep our community well.`,
        ask: ["handwashing", "cleaning", "sanitize", "hygiene"],
      },
    ],
  },

  /* ─────────────────────────── 11. Community ─────────────────────────── */
  {
    id: "community",
    number: "11",
    title: "Community & policies",
    blurb: "Respect, photos, screens, concerns, custody and our commitments.",
    sections: [
      {
        id: "pickup-authorization",
        title: "Who can collect your child",
        summary: "We release children only to parents or caregivers and adults you’ve authorized in advance, and we’ll ask anyone we don’t recognize for photo ID.",
        facts: [{value: "Photo ID", label: "If we don’t recognize them · no copies"}],
        body: `Your child’s safety comes first. We release children only to their parents or caregivers, or to adults you’ve authorized in advance. Please tell us whenever someone else will be collecting your child, and keep your list of authorized adults and emergency contacts current.

> If we don’t recognize the person collecting your child, we’ll ask for a **current, government-issued photo ID** and check it against your list. Photos or copies of ID aren’t accepted, and we can’t release your child without it.`,
        programs: {
          club: `To authorize a new adult, email ${HELLO} **and** add them in Brightwheel.`,
          flex: "Add authorized adults and emergency contacts in your Family Portal profile.",
          camp: "Add authorized adults and emergency contacts in your Family Portal profile before camp.",
          happenings: "Add authorized adults and emergency contacts in your Family Portal profile before the Happening.",
        },
        ask: ["someone else picking up", "grandparent pick up", "nanny pick up", "authorized pickup", "id required"],
      },
      {
        id: "custody",
        title: "Custody and Foster Care",
        summary: "Please share copies of any current custody or protective orders. Yalla does not provide supervised visitation.",
        body: `Families must provide copies of any current custody or protective orders concerning their child. These documents will be kept confidential in the child’s file and used to support their safety and care. Please notify Team Yalla at ${HELLO} whenever an order is modified or expires, and provide updated documentation as applicable.

Yalla does not provide supervised visitation. Visits between a child and a noncustodial parent or caregiver may not take place on the premises.

For children in foster care, placement documentation must be provided before care begins. Children will be released only to the foster parents or the child’s assigned caseworker, unless the caseworker authorizes another individual in a signed letter. All individuals dropping off or picking up the child must present identification and complete the required sign-in or sign-out procedures. Any changes to authorized pickup arrangements must be confirmed in writing by the caseworker.`,
        ask: ["custody", "court order", "restraining order", "foster", "divorce", "visitation"],
      },
      {
        id: "staff-respect",
        title: "Respecting our team",
        summary: "Our team is the heart of Yalla. Please treat them with respect, honor their boundaries and breaks, and don’t question their absences.",
        body: `Our team’s dignity and well-being are essential to a healthy community. We ask every parent and caregiver to honor these expectations:

- **Respect and dignity**: treat every team member with respect at all times. Disrespectful, dismissive or demanding behavior isn’t tolerated.
- **Personal boundaries**: you aren’t entitled to team members’ personal information. Authentic relationships often grow, and team members may choose to share, but please never pressure anyone.
- **Breaks**: a team member outside their group is most likely on a short break or lunch. A friendly smile or hello is perfect; please save longer conversations.
- **Absences**: like all professionals, team members are sometimes away. Please don’t question or express dissatisfaction about absences; coverage is always in place.

Our team members are people first: professionals who care deeply for your children, and individuals who deserve privacy, rest and respect. Families who can’t uphold these standards may be asked to leave Yalla.

Adults are expected to treat children, families and team members with respect. Threatening, discriminatory or abusive conduct is never permitted.`,
        ask: ["staff", "respect", "talk to teacher", "personal information"],
      },
      {
        id: "photography",
        title: "Photos and privacy",
        summary: "You choose separately whether photos are shared privately with families and whether they’re used publicly. Taking part never requires consent.",
        body: `Our team takes photos, and occasionally videos, so families can share in their children’s days. You choose separately whether to allow:

- Photos shared privately with participating families
- Photos used publicly on Yalla’s website, social media or promotional materials

Taking part in our programs never requires photo consent. Because children share play spaces, your child may occasionally appear in the background of a photo. That never overrides your choices: before sharing, we take reasonable steps to leave out, crop or blur identifiable children whose families haven’t opted in.

You can update your choices anytime in your [Family Portal](/portal/home) or by emailing ${HELLO}. Changes apply to future photos. To have an existing image removed from a Yalla channel, contact us; we can’t guarantee removal of copies others have already downloaded or shared.

Please respect other families’ privacy, and ask before photographing or sharing images of other children.`,
        programs: {
          club: "Photos of your child’s day are shared with you in Brightwheel.",
        },
        ask: ["photos", "pictures", "social media", "instagram", "privacy", "photo consent"],
      },
      {
        id: "screen-free",
        title: "Screen-free",
        summary: "Yalla is screen-free. We don’t use televisions, computers, tablets or phone screens in any of our programming.",
        body: `We don’t use televisions, computers, tablets or the screens of smartphones in any part of our programming. Without screens, children engage actively with the world, each other and their own imaginations, supporting problem-solving, memory and attention, social skills, physical health and creativity.

We encourage screen-free time at home too: reading, arts and crafts, outdoor play and family games extend the benefits children enjoy at Yalla. Ask us anytime for screen-free ideas.`,
        ask: ["tv", "screens", "ipad", "movies", "screen time"],
      },
      {
        id: "concerns",
        title: "Raising a concern",
        summary: "Start with a private conversation with your child’s educarer or guide. If that doesn’t resolve it, our leadership team will arrange a meeting.",
        body: `We believe most concerns can be resolved through direct, compassionate conversation, and we can only help with a concern we know about. Here’s our process:

1. **Talk directly**: start with your child’s educarer or guide. Let them know in advance what you’d like to discuss so you can both come prepared, and meet somewhere private, never in front of children or other families.
2. **Involve leadership**: if the concern continues, contact our leadership team at ${HELLO}. They’ll arrange a private, confidential meeting with everyone involved.
3. **Solve it together**: everyone shares observations, listens openly, and agrees on the issue, a shared goal, actions for each person, a timeline and a follow-up date.
4. **Document**: a short summary of the meeting is shared with you and kept on file.
5. **Follow up**: at the follow-up, if the concern is resolved, it’s closed. If not, our leadership decides next steps, which may include mediation, outside support (including our Program Ombudsman) or further involvement from leadership.

Our aim is always to protect the relationship between children, families and our team, through a respectful, transparent process.`,
        programs: {
          flex: `For a concern about a Flex day, talk with the team on the day, or email ${HELLO} afterward.`,
          camp: `For a concern about a camp day, talk with the team at departure, or email ${HELLO}.`,
          happenings: `For a concern about a Happening, talk with the team at departure, or email ${HELLO}.`,
        },
        ask: ["complaint", "concern", "unhappy", "problem with teacher", "grievance", "who do i complain to"],
      },
      {
        id: "non-discrimination",
        title: "Non-discrimination",
        summary: "Yalla welcomes children, families and team members of every background and doesn’t tolerate discrimination of any kind.",
        body: `Yalla is a community rooted in inclusivity, respect and belonging. In line with federal, state and local law and our own values, we don’t discriminate on the basis of race, color, ethnicity, national origin, ancestry, religion, sex, gender identity or expression, sexual orientation, marital status, family structure, age, disability, medical condition, genetic information, socioeconomic status, citizenship status, military or veteran status, or any other protected characteristic.

This applies to everything we do: admissions and enrollment; access to services, spaces and experiences; guidance and support; family engagement and communication; and employment.

Yalla is an affirming, identity-conscious space. We strive to uplift historically marginalized voices, honor cultural traditions and remove barriers to participation. Please raise any concern about discrimination or bias with our leadership team at ${HELLO}; it will be handled with seriousness, care and confidentiality.`,
        ask: ["discrimination", "inclusion", "diversity", "bias"],
      },
      {
        id: "licensing",
        title: "Licensing and our standards",
        summary: "Yalla is license-exempt under California Health and Safety Code §1596.792 and voluntarily follows Title 22 licensing standards for staffing, ratios and safety.",
        body: `Yalla Coworking & Childcare is a license-exempt program operating under California Health and Safety Code §1596.792, which allows qualifying programs to provide care without a license while specific conditions are met, including parents or designated guardians remaining onsite.

Although license-exempt, Yalla voluntarily follows the staffing, safety and best-practice standards of Title 22, Division 12, Chapter 1 of the California Code of Regulations. That means:

- Every team member is at least 18, able to care for children, and trained in health, safety and child development
- Educarers and guides meet or exceed the qualifications required in licensed programs, and assistants meet the licensed criteria for their role
- Our ratios mirror those required of licensed programs
- Our director holds the qualifications required to oversee early childhood programs
- Every team member and volunteer is cleared through a criminal background check
- At least one adult with current pediatric CPR and First Aid certification is always onsite

We also keep the records licensed programs maintain, including staff health screenings, immunizations and mandated reporter training. Our team members are mandated reporters of suspected child abuse under California law.`,
        ask: ["licensed", "license", "title 22", "background check", "qualifications", "cpr certified", "mandated reporter"],
      },
    ],
  },
];

/** Every section, with its chapter, for search and links. */
export const HANDBOOK_SECTIONS = HANDBOOK.flatMap((c) => c.sections.map((s) => ({ ...s, chapterId: c.id, chapterTitle: c.title, chapterNumber: c.number })));
export type HandbookEntry = (typeof HANDBOOK_SECTIONS)[number];
