// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// Only your calendar is read, decided from Outlook's calendar list only (never per event):
//   - only "Calendar" ticked: every event is yours (also with the small month calendar's selected day on the page);
//   - another calendar ticked too: it is unticked for the read and ticked again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({
  outlookLabels: true, // "Deselect calendar 'Calendar'" / "Select calendar 'Colleague'", like the new Outlook
  calendars: [
    { name: "Calendar" },
    { name: "20" },                               // the selected day in the small month calendar: not a calendar
    { name: "Friday, November 06, 2026" },
    { name: "Colleague", selected: false, events: [
      "Colleague review, 9:00 AM to 10:00 AM, Friday, November 06, 2026, Busy",
      "Colleague trip, all day event, Friday, November 06, 2026, OOF",
    ] },
  ],
  ownEvents: [ // the fake page shows 2–8 Nov: Friday is 6 Nov
    { label: "jira extension, 10:00 AM to 11:00 AM, Friday, November 06, 2026, Busy", color: "rgb(42, 50, 50)" },   // a past event, grey
    { label: "P&L review, 11:00 AM to 12:00 PM, Friday, November 06, 2026, Busy", color: "rgb(84, 99, 100)" },
    { label: "Check hours, 3:00 PM to 3:30 PM, Friday, November 06, 2026, Busy", color: "rgb(202, 80, 16)" },   // a category colour
  ],
});
const friday = () => (page.stored.calendar_cache?.["2026-11-06"]?.events || []).filter((e) => !e.allDay).map((e) => e.subject).sort();

test("only your calendar ticked: every event is yours (colours don't matter), nothing left out, nothing unticked", async () => {
  const r = await page.read();
  assert.equal(r.ok, true);
  assert.deepEqual(r.hid_calendars, []);
  assert.deepEqual(friday(), ["Check hours", "P&L review", "jira extension"]);
  assert.deepEqual(page.toggles, [], "nothing clicked in the calendar list");
  assert.match(page.badge.texts.at(-1) || "Timefill · read", /^Timefill · read/);
});

test("a colleague's calendar ticked too: unticked for the read, ticked again; only your events stored", async () => {
  page.calendarEls[3].click(); // tick "Colleague"
  page.toggles.length = 0;
  const r = await page.read();
  assert.equal(r.ok, true);
  assert.deepEqual(r.hid_calendars, ["Colleague"]);
  assert.deepEqual(page.toggles, ["Colleague:false", "Colleague:true"], "unticked, then ticked again");
  assert.deepEqual(friday(), ["Check hours", "P&L review", "jira extension"]);
});
