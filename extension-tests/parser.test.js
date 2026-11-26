// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// Outlook label formats. When Microsoft changes the page, paste the new labels from
// "Diagnose Outlook page" in here as test cases, then adjust outlook-parser.js until they pass.
import assert from "node:assert/strict";
import { test } from "node:test";

import "../extension/outlook-parser.js";
import { fakeDoc } from "./helpers.js";

const P = globalThis.TimefillParser;
const now = new Date(2026, 10, 12);
const parse = (label, opts = {}) => P.parseLabel(label, { now, ...opts });
const brief = (e) => e && [e.subject, e.start, e.end, e.allDay, e.busy];

test("English, 24h", () => {
  assert.deepEqual(brief(parse("Alpha E layout review, 08:00 to 11:30, Monday, November 9, 2026, Busy, Organizer Organizer Name")),
    ["Alpha E layout review", "2026-11-09T08:00", "2026-11-09T11:30", false, 2]);
});

test("English, AM/PM and a comma in the title", () => {
  assert.deepEqual(brief(parse("Alpha M weekly, risks, 1:30 PM to 5:00 PM, Tuesday, 10 November 2026, Tentative")),
    ["Alpha M weekly, risks", "2026-11-10T13:30", "2026-11-10T17:00", false, 1]);
});

test("Italian", () => {
  assert.deepEqual(brief(parse("Alpha e sopralluogo, dalle 13:30 alle 16:00, martedì 10 novembre 2026, Occupato, Organizzatore Organizer Name")),
    ["Alpha e sopralluogo", "2026-11-10T13:30", "2026-11-10T16:00", false, 2]);
});

test("all-day vacation, out of office", () => {
  assert.deepEqual(brief(parse("Ferie, all day event, Wednesday, November 11, 2026, Out of office")),
    ["Ferie", "2026-11-11T00:00", "2026-11-12T00:00", true, 3]);
  assert.deepEqual(brief(parse("Ferie, tutto il giorno, mercoledì 11 novembre 2026, Fuori sede")),
    ["Ferie", "2026-11-11T00:00", "2026-11-12T00:00", true, 3]);
});

test("multi-day all-day event covers every day, inclusive", () => {
  const e = parse("Vacation, all day event, Monday, November 16, 2026 to Wednesday, November 18, 2026, Out of office");
  assert.deepEqual([e.start, e.end], ["2026-11-16T00:00", "2026-11-19T00:00"]);
});

test("numeric dates follow the day/month setting", () => {
  assert.equal(parse("Alpha E, 08:00 - 09:00, 09/11/2026").start, "2026-11-09T08:00");
  assert.equal(parse("Alpha E, 08:00 - 09:00, 11/09/2026", { dateOrder: "mdy" }).start, "2026-11-09T08:00");
  assert.equal(parse("Alpha E, 08:00 - 09:00, 9.11.2026").start, "2026-11-09T08:00"); // 9.11 is not a time
});

test("label without year takes the nearest year", () => {
  assert.equal(parse("Alpha E, 08:00 to 09:00, Monday, November 9").start, "2026-11-09T08:00");
});

test("cancelled events are flagged; non-events are ignored", () => {
  assert.equal(parse("Canceled: Alpha E review, 08:00 to 09:00, Monday, November 9, 2026").cancelled, true);
  assert.equal(parse("Go to Monday, November 9, 2026"), null); // date-picker button
  assert.equal(parse("New event"), null);
  assert.equal(parse("Reminder at 08:00"), null); // no date
});

test("readPage: dedupes, uses column headers for visible days, skips cancelled", () => {
  const doc = fakeDoc({
    [P.CONFIG.eventSelector]: [
      { "aria-label": "Alpha E layout review, 08:00 to 11:30, Monday, November 9, 2026, Busy" },
      { "aria-label": "Alpha E layout review, 08:00 to 11:30, Monday, November 9, 2026, Busy" },
      { "aria-label": "Canceled: old sync, 09:00 to 10:00, Tuesday, November 10, 2026" },
      { "aria-label": "Go to Monday, November 16, 2026" },
      { title: "Ferie, all day event, Wednesday, November 11, 2026, Out of office" },
    ],
    [P.CONFIG.dayHeaderSelector]: ["Monday, November 9, 2026", "Tuesday, November 10, 2026", "Wednesday, November 11, 2026",
      "Thursday, November 12, 2026", "Friday, November 13, 2026", "November 2026"].map((t) => ({ "aria-label": t })),
  });
  const r = P.readPage(doc, { now });
  assert.deepEqual(r.events.map((e) => e.subject), ["Alpha E layout review", "Ferie"]);
  assert.deepEqual(r.visibleDates, ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.equal(r.method, "headers");
});

test("readPage falls back to the URL for visible days", () => {
  const doc = fakeDoc({ [P.CONFIG.eventSelector]: [] });
  const r = P.readPage(doc, { url: "https://outlook.office.com/calendar/view/workweek/2026/11/11" });
  assert.deepEqual(r.visibleDates, ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
});

test("cache: a re-read replaces that day's events, other days are kept", () => {
  const e1 = { subject: "A", start: "2026-11-09T08:00", end: "2026-11-09T09:00", allDay: false, busy: 2 };
  let cache = P.mergeIntoCache({}, ["2026-11-09", "2026-11-10"], [e1], now);
  assert.equal(cache["2026-11-09"].events.length, 1);
  assert.equal(cache["2026-11-10"].events.length, 0);
  cache = P.mergeIntoCache(cache, ["2026-11-09"], [], now);
  assert.equal(cache["2026-11-09"].events.length, 0);
  assert.ok(cache["2026-11-10"]);
});

test("organizer and response status are optional; no organizer = my own event", () => {
  const mine = parse("Alpha E layout, 08:00 to 09:00, Monday, November 9, 2026");
  assert.deepEqual([mine.subject, mine.organizer, mine.response, mine.own, mine.busy], ["Alpha E layout", null, null, true, 2]);
  const invited = parse("Alpha M weekly, 09:00 to 10:00, Monday, November 9, 2026, By Alex Example, Accepted, Busy");
  assert.deepEqual([invited.subject, invited.organizer, invited.response, invited.own], ["Alpha M weekly", "Alex Example", "accepted", false]);
  const onlyResponse = parse("Sync, 10:00 to 11:00, Monday, November 9, 2026, Tentatively accepted");
  assert.deepEqual([onlyResponse.organizer, onlyResponse.response, onlyResponse.own], [null, "tentative", true]);
  // a title that starts with "By" is still the title
  assert.equal(parse("By the river visit, 10:00 to 11:00, Monday, November 9, 2026").subject, "By the river visit");
});

test("a leading 'X icon, ' is not part of the title", () => {
  assert.equal(parse("Recurring icon, Alpha E daily, 08:00 to 08:15, Monday, November 9, 2026").subject, "Alpha E daily");
  assert.equal(parse("Teams icon, Recurring event icon, Alpha M call, 09:00 to 10:00, Monday, November 9, 2026").subject, "Alpha M call");
  // ...unless that part is the whole title
  assert.equal(parse("New app icon, 09:00 to 10:00, Monday, November 9, 2026").subject, "New app icon");
});

test("Canceled: / Annullata: / Declined: labels are skipped", () => {
  assert.equal(parse("Declined: Alpha E review, 08:00 to 09:00, Monday, November 9, 2026").declined, true);
  assert.equal(parse("Annullata: riunione, dalle 13:30 alle 14:00, lunedì 9 novembre 2026").cancelled, true);
  assert.equal(parse("Recurring icon, Canceled: daily, 08:00 to 08:15, Monday, November 9, 2026").cancelled, true);
  const doc = fakeDoc({ [P.CONFIG.eventSelector]: [
    "Declined: Alpha E review, 08:00 to 09:00, Monday, November 9, 2026",
    "Annullata: riunione, dalle 13:30 alle 14:00, lunedì 9 novembre 2026",
    "Canceled: old sync, 09:00 to 10:00, Monday, November 9, 2026",
    "Alpha E kept, 10:00 to 11:00, Monday, November 9, 2026",
  ].map((l) => ({ "aria-label": l })) });
  const r = P.readPage(doc, { now });
  assert.deepEqual(r.events.map((e) => e.subject), ["Alpha E kept"]);
  assert.equal(r.skipped, 3);
});

test("de-dupe by title + start: same title at another time is a different event", () => {
  const doc = fakeDoc({ [P.CONFIG.eventSelector]: [
    "Alpha E review, 08:00 to 09:00, Monday, November 9, 2026, Busy",
    "Recurring icon, Alpha E review, 08:00 to 09:00, Monday, November 9, 2026", // same event, other rendering
    "Alpha E review, 14:00 to 15:00, Monday, November 9, 2026, Busy",          // same title, later
  ].map((l) => ({ "aria-label": l })) });
  assert.deepEqual(P.readPage(doc, { now }).events.map((e) => e.start), ["2026-11-09T08:00", "2026-11-09T14:00"]);
});

test("'+N more events' buttons are found (not when already expanded)", () => {
  const doc = fakeDoc({ [P.CONFIG.moreButtonSelector]: [
    { "aria-label": "+2 more events" }, { text: "+3" }, { text: "2 more" }, { text: "Altri 4 eventi" },
    { "aria-label": "+1 more events", "aria-expanded": "true" }, { text: "New event" }, { text: "Today" },
  ] });
  assert.deepEqual(P.findMoreButtons(doc).map((b) => b.label), ["+2 more events", "+3", "2 more", "Altri 4 eventi"]);
});

test("Outlook overlap groups ('N events, X busy') and title-less events are skipped", () => {
  assert.equal(P.isGroupLabel("1:00 PM to 3:00 PM, 3 events, 2 busy, Monday, November 9, 2026"), true);
  assert.equal(parse("1:00 PM to 3:00 PM, 3 events, 2 busy, Monday, November 9, 2026"), null);
  assert.equal(parse("13:00 to 15:00, 2 events, 1 busy, Monday, November 9, 2026"), null);
  assert.equal(parse("Alpha E review, 1:00 PM to 3:00 PM, Monday, November 9, 2026"). subject, "Alpha E review"); // a normal event
  assert.equal(parse("2026, 08:00 to 09:00, Monday, November 9, 2026"), null);   // title is only a year
  assert.equal(parse("12, 08:00 to 09:00, Monday, November 9, 2026"), null);     // only a number
  assert.equal(parse(", 08:00 to 09:00, Monday, November 9, 2026"), null);       // empty title
  const doc = fakeDoc({ [P.CONFIG.eventSelector]: [
    { "aria-label": "1:00 PM to 3:00 PM, 2 events, 2 busy, Monday, November 9, 2026" },
    { "aria-label": "Alpha E review, 1:00 PM to 3:00 PM, Monday, November 9, 2026, Busy" },
  ] });
  assert.deepEqual(P.readPage(doc, { now }).events.map((e) => e.subject), ["Alpha E review"]);
  assert.equal(P.diagnose(doc, { now }).groupLabelsSkipped, 1);
});

test("'+N more' buttons: only inside the calendar, and 'show N more' must be about events", () => {
  const inMain = (attrs) => ({ ...attrs, _inMain: true });
  const doc = {
    querySelector: (sel) => (sel === P.CONFIG.moreButtonScope ? {} : null),
    querySelectorAll: (sel) => (sel === P.CONFIG.moreButtonSelector ? [
      inMain({ text: "+2" }), { text: "+3" } /* attendee avatars in a peek, outside the calendar */,
      inMain({ text: "Show 3 more replies" }), inMain({ text: "Show 2 more events" }),
    ] : []).map((a) => ({ getAttribute: (k) => a[k] ?? null, textContent: a.text || "", closest: (s) => (s === P.CONFIG.moreButtonScope && a._inMain ? {} : null) })),
  };
  assert.deepEqual(P.findMoreButtons(doc).map((b) => b.label), ["+2", "Show 2 more events"]);
});

test("'N more events from …' buttons are clicked too", () => {
  const doc = fakeDoc({ [P.CONFIG.moreButtonSelector]: [
    { "aria-label": "2 more events from Monday, November 9, 2026" }, { text: "+3 more events from Tuesday" },
    { text: "altri 2 eventi da lunedì 9 novembre" }, { text: "More events from your team" } /* no number: not ours */ ] });
  assert.deepEqual(P.findMoreButtons(doc).map((b) => b.label), ["2 more events from Monday, November 9, 2026", "+3 more events from Tuesday", "altri 2 eventi da lunedì 9 novembre"]);
});

test("diagnose: all-day labels that are not read say why, and 'look for' lists every element with that text", () => {
  const items = [
    { "aria-label": "Delta demo, all day event, Wednesday, November 4, 2026 to Friday, November 6, 2026, Busy" },
    { "aria-label": "Delta, all day event, Busy" },                      // no date in the label
    { tag: "SPAN", text: "Delta" },                                      // only text, no label
  ];
  const doc = fakeDoc({ [P.CONFIG.eventSelector]: items.slice(0, 2), [P.CONFIG.dayHeaderSelector]: [], "*": items });
  const d = P.diagnose(doc, { now, find: "delta" });
  assert.deepEqual(d.allDayRead.map((e) => e.subject), ["Delta demo"]);
  assert.deepEqual(d.allDayNotRead, [{ label: "Delta, all day event, Busy", why: "no date found in the label" }]);
  assert.deepEqual(d.found.map((f) => f.read), ["read as an event", "no date found in the label", "(no label: Timefill reads aria-label / title only)"]);
  assert.equal(P.whyNot("Delta demo, all day event, Wednesday, November 4, 2026, Busy", { now }), null);
});

