// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// Automatic reads (the reader re-reads by itself when the page changes): "+N more events" are opened only while
// the Outlook tab is in the background, and the all-day events stored for a day are never wiped by a read that
// couldn't see them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({ focused: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const wedEvents = () => (page.stored.calendar_cache?.["2026-11-04"]?.events || []).map((e) => e.subject).sort();

test("you are working in Outlook: no clicks, and the hidden all-day events stored before are kept", async () => {
  // stored by an earlier read
  page.stored.calendar_cache = { "2026-11-04": { read_at: "2026-11-04T08:00", events: [
    { subject: "Delta demo", start: "2026-11-04T00:00", end: "2026-11-05T00:00", allDay: true, busy: 2 },
    { subject: "Gone meeting", start: "2026-11-04T09:00", end: "2026-11-04T10:00", allDay: false, busy: 2 },
  ] } };
  page.connect();
  await wait(1200); // the first automatic read
  assert.equal(page.clicks, 0, "nothing clicked while you are in Outlook");
  assert.deepEqual(wedEvents(), ["Delta demo", "Showroom out"]); // hidden all-day kept; timed events follow the page
});

test("the Outlook tab is in the background: the automatic read opens the '+N more' and reads them", async () => {
  page.focused = false;
  page.observers.forEach((o) => o.cb([]));
  await wait(1500 + 2 * 1200);
  assert.equal(page.clicks, 2);
  assert.deepEqual(wedEvents(), ["Alpha training", "Delta demo", "Showroom out"]);
  assert.equal(page.popups.length, 0);
});
