# FAQs

One source of truth for every question, shown on the FAQ page (`/faq`) and on program pages.

## Where things live

- **Starting content:** `content/faq.ts`. Each entry has an id, question, answer, primary category, optional extra categories (`alsoIn`), the pages it appears on with a position (`pages`), an order and a status (published, draft, archived).
- **Staff edits:** Admin → FAQs (permission `content.manage`, owners have it). Saving stores the entry in the `faq_entries` table, which replaces the starting entry with the same id everywhere. "Reset to original" removes the edit. New questions are added the same way. Archive instead of deleting.
- **Policies:** `content/policies.ts`. A FAQ with `policy` shows that approved policy's wording instead of its own answer, so the policy is written once and also appears on `/policies`. Policy wording isn't editable in admin.

## Showing questions on a page

`<ContextualFaq page="club-yalla" />` renders "A few good questions." with that page's chosen entries and a link to the FAQ page. Pages: `club-yalla`, `play-pass`, `flex`, `camp`, `happenings`, `immersive`. To add a page, add it to `FAQ_PAGES` and place the component.

## Links

- `/faq?category=billing` opens a category.
- `/faq?q=cancellation-refund-policy` opens a question.

## Drafts

Drafts never appear on the site. Each notes what Yalla needs to confirm (`needs`). Publish only once Yalla has provided the answer.
