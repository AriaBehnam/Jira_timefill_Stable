// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The new Outlook labels each tick box with what a click does: "Deselect calendar 'Calendar'" (ticked) and
// "Select calendar 'Colleague'" (not ticked). Your calendar must be recognised from that, and never be unticked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({ outlookLabels: true, calendars: [
  { name: "Calendar" },
  { name: "all", fixedLabel: "Deselect all calendars shown" },                  // a button of the list, not a calendar
  { name: "United Kingdom holidays", selected: false },
  { name: "Team lead", events: ["Team weekly, 11:00 AM to 12:00 PM, Monday, November 02, 2026, Tentative"] },
  { name: "Colleague", selected: false },
] });
const subjects = () => Object.values(page.stored.calendar_cache || {}).flatMap((d) => d.events.map((e) => e.subject));

test("'Deselect calendar 'Calendar'' is your calendar, ticked: never unticked; the team calendar is unticked for the read", async () => {
  const shown = page.P.shownCalendars(document, "Calendar, Calendario");
  assert.deepEqual(shown, [{ name: "Calendar", own: true }, { name: "Team lead", own: false }]);
  const r = await page.read();
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.hid_calendars, ["Team lead"]);
  assert.deepEqual(page.toggles, ["Team lead:false", "Team lead:true"], "only the team calendar, and it is ticked again");
  assert.ok(subjects().includes("Delta SdF"));
  assert.ok(!subjects().includes("Team weekly"));
});

test("your calendar can't be found (another name): nothing is unticked or stored, and the reason is given", async () => {
  page.toggles.length = 0;
  page.stored.calendar_cache = undefined;
  page.stored.settings = { own_calendars: "My agenda" };
  const r = await page.read();
  assert.equal(r.ok, false);
  assert.match(r.error, /can't find your own calendar/);
  assert.deepEqual(page.toggles, []);
  assert.equal(page.stored.calendar_cache, undefined);
});
