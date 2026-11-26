// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// Calendar list safety: automatic reads never untick anything; two ticked calendars with your calendar's name = not read.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({ outlookLabels: true, focused: false, calendars: [
  { name: "Calendar" },
  { name: "Colleague", events: ["Colleague review, 9:00 AM to 10:00 AM, Monday, November 02, 2026, Busy"] },
] });

test("an automatic read (Timefill didn't ask) never unticks a calendar and stores nothing from a mixed view", async () => {
  page.connect();
  await new Promise((r) => setTimeout(r, 1200));
  assert.deepEqual(page.toggles, []);
  assert.equal(page.stored.calendar_cache, undefined);
});

test("two ticked calendars called like yours: Timefill can't tell which is yours, so it reads nothing", async () => {
  page.calendarEls[1].click(); // untick the colleague
  page.toggles.length = 0;
  page.calendarEls.push(page.el({ "aria-label": "Deselect calendar 'Calendar'" })); // a second "Calendar", ticked
  page.calendarEls.at(-1).isOn = () => true;
  page.calendarEls.at(-1).eventEls = [];
  page.calendarEls[1].click(); // tick the colleague again
  page.toggles.length = 0;
  const r = await page.read();
  assert.equal(r.ok, false);
  assert.match(r.error, /can't tell which is yours/);
  assert.deepEqual(page.toggles, []);
});
