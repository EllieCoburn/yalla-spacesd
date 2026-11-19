-- New wording for "What is Camp Yalla?" (from Yalla). If staff saved an edited copy of this
-- question in Admin, it gets the new answer too.
UPDATE "faq_entries" SET "answer" = 'Camp Yalla is our drop-off program for children ages 18 months to 10 years, offered on select days when school or childcare is closed. We plan camp around the ages of the children joining us. For our youngest campers, that might mean a morning mixing mud in the play garden. For an older group, it might mean having the better part of an afternoon to finish something they’ve been building together.

Camp runs from 9:00 am to 3:00 pm, with optional Early Bird care starting at 8:00 am and the option to stay until 4:30 pm. You can book one day at a time, including the morning of camp. If space is available, booking stays open until 30 minutes before camp begins.

[See upcoming camp dates →](/programs/camp-yalla#dates)' WHERE "id" = 'what-is-camp';
