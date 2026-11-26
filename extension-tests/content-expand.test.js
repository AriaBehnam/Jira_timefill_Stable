// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// The Outlook reader with the real parser on a fake Outlook page: all-day events hidden behind
// "N more events from <day>" buttons are read, also when the popup lists them without a date.
import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook();
const P = page.P, el = page.el, read = page.read;
const popups = page.popups;
const stored = page.stored;

test("hidden all-day events behind 'N more events from <day>' are read, dated by the button", async () => {
  const r = await read();
  assert.equal(r.ok, true);
  assert.deepEqual(r.visibleDates.slice(0, 5), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  assert.equal(r.stats.moreClicked, 2);
  assert.equal(r.stats.hiddenFound, 4);
  assert.equal(popups.length, 0, "the popups were closed again");
  const wed = stored.calendar_cache["2026-11-04"].events.map((e) => [e.subject, e.allDay, e.busy]);
  assert.deepEqual(wed.filter(([s]) => s !== "Showroom out"), [["Delta demo", true, 2], ["Alpha training", true, 0]]);
  const thu = stored.calendar_cache["2026-11-05"].events.map((e) => e.subject);
  assert.ok(thu.includes("Delta demo") && thu.includes("Delta"));
  // "OOF" is out of office
  assert.equal(stored.calendar_cache["2026-11-02"].events.find((e) => e.subject === "(No subject)").busy, 3);
});

test("a long all-day event that started weeks ago does not decide which week is on screen", () => {
  const doc = { querySelector: () => null, querySelectorAll: (sel) => (sel === P.CONFIG.moreButtonSelector || sel === P.CONFIG.dayHeaderSelector ? [] : [
    el({ "aria-label": "Showroom out, all day event, Monday, November 02, 2026 to Monday, November 23, 2026, Free" }),
    el({ "aria-label": "Delta SdF, 10:30 AM to 12:30 PM, Tuesday, November 17, 2026, Busy" }),
  ]) };
  const r = P.readPage(doc, {});
  assert.deepEqual([r.method, r.visibleDates[0]], ["event weeks", "2026-11-16"]);
});
