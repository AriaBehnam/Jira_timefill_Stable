// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDay, buildPlan, eventKey, keywordMatches, workWindows } from "../extension/planner.js";
import { parseSummary } from "../extension/projects.js";
import { DEFAULTS, ALPHA, phased, ev } from "./helpers.js";

const S = DEFAULTS;
const MON = "2026-11-09", FRI = "2026-11-13";
const LATER = new Date(2026, 11, 1); // "now" after the test week

test("work windows: 8h Mon-Thu, 7h Fri, nothing on weekend", () => {
  assert.deepEqual(workWindows(MON, S), [[480, 750], [810, 1020]]);
  assert.deepEqual(workWindows(FRI, S), [[480, 750], [810, 960]]);
  assert.deepEqual(workWindows("2026-11-14", S), []);
});

test("summary parsing", () => {
  const p = parseSummary("26.020.P01 Alpha Plant - New Line · EXEC · SD");
  assert.deepEqual([p.name, p.code, p.phase, p.role], ["26.020.P01 Alpha Plant - New Line", "26.020.P01", "EXEC", "SD"]);
  assert.equal(parseSummary("VACANZA - Task interno per WorkLog-ALL"), null);
});

test("project event over lunch counts in full and picks role", () => {
  const d = buildDay(MON, [ev("Alpha E layout", MON, "11:00", "15:00"), ev("Alpha M weekly", MON, "16:00", "17:00")], [], [ALPHA], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.issue, e.start_hm, e.end_hm]),
    [["PRJ-224", "11:00", "15:00"], ["PRJ-223", "16:00", "17:00"]]);
  assert.equal(d.missing, 3 * 60); // 8h - 5h worked
});

test("role tokens ignore case", () => {
  const d = buildDay(MON, [ev("alpha m weekly", MON, "09:00", "10:00"), ev("[e] ALPHA review", MON, "10:00", "11:00")], [], [ALPHA], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => e.issue), ["PRJ-223", "PRJ-224"]);
});

test("phase follows project status", () => {
  const d = buildDay(MON, [ev("Alpha M call", MON, "09:00", "10:00")], [], [phased("X", ["Alpha"], "pre-sale")], S, [], LATER);
  assert.equal(d.entries[0].issue, "PRJ-221");
});

test("vacation fills the whole day, 7h on Friday, as one worklog", () => {
  const vac = { subject: "Ferie", start: "2026-11-13T00:00", end: "2026-11-14T00:00", allDay: true, busy: 3 };
  const d = buildDay(FRI, [vac], [], [ALPHA], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.issue, e.minutes, e.start_hm]), [["LEAVE-1", 420, "08:00"]]);
  assert.equal(d.state, "ready");
});

test("worklogs already in Jira keep their id on the calendar (so they can be moved)", () => {
  const d = buildDay(MON, [], [{ id: "10042", issue: "INT-19", start: "2026-11-09T09:00", seconds: 2 * 3600 }], [ALPHA], S, [], LATER);
  const seg = d.segments.find((x) => x.kind === "logged");
  assert.deepEqual([seg.worklog_id, seg.start, seg.end], ["10042", 9 * 60, 11 * 60]);
});

test("existing Jira worklogs are never duplicated", () => {
  const logged = [{ issue: "INT-19", start: "2026-11-09T08:00", seconds: 3.5 * 3600 }];
  const d = buildDay(MON, [ev("Alpha E", MON, "08:00", "12:30")], logged, [ALPHA], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.start_hm, e.end_hm]), [["11:30", "12:30"]]);
});

test("events at the same time are both proposed in full, like the calendar (you split them)", () => {
  const d = buildDay(MON, [ev("Alpha E focus", MON, "08:00", "12:30"), ev("Alpha M call", MON, "09:00", "10:00")], [], [ALPHA], S, [], LATER);
  assert.ok(d.entries.some((e) => e.issue === "PRJ-223" && e.start_hm === "09:00" && e.end_hm === "10:00"));
  assert.ok(d.entries.some((e) => e.start_hm === "08:00" && e.end_hm === "12:30")); // not cut around the call
  assert.equal(d.entries.reduce((a, e) => a + e.minutes, 0), 270 + 60);
});

test("events are still cut by your manual entries", () => {
  const manual = [{ id: "m1", date: MON, start: "09:00", end: "10:00", issue: "INT-19", label: "manual" }];
  const d = buildDay(MON, [ev("Alpha E focus", MON, "08:00", "12:30")], [], [ALPHA], S, manual, LATER);
  assert.deepEqual(d.entries.filter((e) => e.source === "calendar").map((e) => [e.start_hm, e.end_hm]), [["08:00", "09:00"], ["10:00", "12:30"]]);
});

test("several keywords for one project, separated by commas", () => {
  const p = { ...ALPHA, keywords: ["alpha", "big plant, line 3"] };
  const d = buildDay(MON, [ev("Line 3 E review", MON, "09:00", "10:00"), ev("Big plant M call", MON, "11:00", "12:00")], [], [p], S, [], LATER);
  assert.equal(d.entries.length, 2);
  assert.equal(d.unmatched.length, 0);
});

test("Jira vs calendar: matching worklogs take the event title, differences are reported, ignored ones are not", () => {
  const evs = [ev("Alpha E layout", MON, "09:00", "10:00"), ev("Alpha M call", MON, "14:00", "15:00")];
  const logged = [
    { id: "1", issue: "PRJ-224", start: `${MON}T09:00`, seconds: 3600, comment: "" },          // same project, same time
    { id: "2", issue: "PRJ-224", start: `${MON}T11:00`, seconds: 3600, comment: "" },          // same project, other time
    { id: "3", issue: "INT-19", start: `${MON}T16:00`, seconds: 3600, comment: "admin" },      // nothing in the calendar
  ];
  const day = buildDay(MON, evs, logged, [ALPHA], S, [], LATER);
  const seg = (id) => day.segments.find((x) => x.worklog_id === id);
  assert.equal(seg("1").label, "Alpha E layout");
  assert.equal(seg("1").diff, undefined);
  assert.equal(seg("3").label, "admin");
  const by = Object.fromEntries(day.diffs.map((x) => [x.id, x]));
  assert.equal(by[`wl:PRJ-224|${MON}T11:00|60`].why, "time"); // keyed by issue, start and length
  assert.equal(by[`wl:INT-19|${MON}T16:00|60`].why, "missing");
  assert.equal(by[`ev:alpha m call|${MON}T14:00`]?.why, undefined); // the 14:00 call is proposed (to fill), not a difference
  const ign = buildDay(MON, evs, logged, [ALPHA], S, [], LATER, new Set([`wl:INT-19|${MON}T16:00|60`]));
  assert.deepEqual(ign.diffs_ignored, [`wl:INT-19|${MON}T16:00|60`]);
  assert.ok(!ign.diffs.some((x) => x.id.startsWith("wl:INT-19")));
  // the ignore stays when the worklog gets another id (e.g. read back from Jira after posting)
  const relogged = logged.map((w) => (w.id === "3" ? { ...w, id: "10234" } : w));
  assert.ok(!buildDay(MON, evs, relogged, [ALPHA], S, [], LATER, new Set([`wl:INT-19|${MON}T16:00|60`])).diffs.some((x) => x.id.startsWith("wl:INT-19")));
  // an ignore saved by an older version (by id) still counts
  assert.deepEqual(buildDay(MON, evs, logged, [ALPHA], S, [], LATER, new Set(["wl:3"])).diffs_ignored, ["wl:3"]);
});

test("Jira vs calendar: same project, one covers the other, nothing else in the way -> no warning", () => {
  const call = ev("Alpha E layout", MON, "09:00", "10:00");
  const longer = [{ id: "L", issue: "PRJ-224", start: `${MON}T09:00`, seconds: 1.5 * 3600, comment: "" }]; // 09:00-10:30
  const day = buildDay(MON, [call], longer, [ALPHA], S, [], LATER);
  assert.deepEqual(day.diffs, []);
  assert.equal(day.segments.find((x) => x.worklog_id === "L").label, "Alpha E layout");
  // shorter worklog inside the event: also fine
  const shorter = [{ id: "S", issue: "PRJ-224", start: `${MON}T09:15`, seconds: 0.5 * 3600, comment: "" }];
  assert.deepEqual(buildDay(MON, [call], shorter, [ALPHA], S, [], LATER).diffs.filter((x) => x.side === "jira"), []);
  // ...but if the extra half hour runs into another event, it is reported
  const other = ev("Random sync", MON, "10:00", "10:30");
  assert.equal(buildDay(MON, [call, other], longer, [ALPHA], S, [], LATER).diffs.find((x) => x.id === `wl:PRJ-224|${MON}T09:00|90`)?.why, "time");
});

test("Jira vs calendar: a calendar event that is not in Jira and not proposed is reported", () => {
  // the day already has its hours in Jira (other issue at another time), so the event is not proposed
  const logged = [{ id: "9", issue: "INT-19", start: `${MON}T08:00`, seconds: 8 * 3600, comment: "" }];
  const day = buildDay(MON, [ev("Alpha E layout", MON, "17:00", "18:00")], logged, [ALPHA], S, [], LATER);
  const d = day.diffs.find((x) => x.side === "calendar");
  assert.equal(d.why, "missing");
  assert.ok(day.segments.some((x) => x.kind === "diff" && x.label === "Alpha E layout"));
});

test("unmatched and closed projects are reported, not filled", () => {
  const closed = phased("Old", ["Hotel"], "closed");
  const d = buildDay(MON, [ev("Random sync", MON, "09:00", "10:00"), ev("Hotel E", MON, "10:00", "11:00")], [], [closed], S, [], LATER);
  assert.equal(d.entries.length, 0);
  assert.deepEqual(d.unmatched.map((u) => u.reason), ["no project keyword in the title", "Old: project is closed"]);
});

test("manual assignment", () => {
  const o = [{ id: "a", date: MON, start: "13:30", end: "17:00", issue: "INT-19" }];
  const d = buildDay(MON, [], [], [ALPHA], S, o, LATER);
  assert.deepEqual([d.entries[0].issue, d.entries[0].minutes], ["INT-19", 210]);
});

test("entries that haven't ended yet are flagged as future", () => {
  const d = buildDay(MON, [ev("Alpha E", MON, "08:00", "09:00"), ev("Alpha E x", MON, "11:00", "12:00")], [], [ALPHA], S, [], new Date(2026, 10, 9, 10, 0));
  assert.deepEqual(d.entries.map((e) => e.future), [false, true]);
});

test("a day with its full hours in Jira is complete, whatever time the worklogs start", () => {
  const logged = [{ issue: "PRJ-224", start: "2026-11-09T09:00", seconds: 8 * 3600 }];
  const d = buildDay(MON, [ev("Alpha M call", MON, "08:00", "08:30")], logged, [ALPHA], S, [], LATER);
  assert.equal(d.state, "complete");
  assert.equal(d.missing, 0);
  assert.equal(d.entries.length, 0);
  assert.ok(!d.segments.some((s) => s.kind === "missing"));
});

test("partly logged day: missing = only the hours still needed; real events are proposed in full", () => {
  // 6h logged 10:00-16:00 -> 2h still needed, although 08:00-10:00 and 16:00-17:00 are free (3h)
  const logged = [{ issue: "INT-19", start: "2026-11-09T10:00", seconds: 6 * 3600 }];
  const d = buildDay(MON, [], logged, [ALPHA], S, [], LATER);
  assert.deepEqual(d.missing_slots.map((m) => [m.start_hm, m.end_hm]), [["08:00", "10:00"]]);
  const d2 = buildDay(MON, [ev("Alpha E", MON, "08:00", "10:00"), ev("Alpha M", MON, "16:00", "17:00")], logged, [ALPHA], S, [], LATER);
  assert.equal(d2.planned, 180); // 9h worked that day: overtime is logged too
  assert.equal(d2.missing, 0);
  assert.equal(d2.state, "ready");
});

test("days before 'track from' are not checked", () => {
  const s = { ...S, track_from: "2026-11-10" };
  const d = buildDay(MON, [ev("Alpha E", MON, "08:00", "10:00")], [], [ALPHA], s, [], LATER);
  assert.equal(d.state, "untracked");
  assert.deepEqual([d.target, d.missing, d.entries.length], [0, 0, 0]);
  assert.equal(buildDay("2026-11-10", [], [], [ALPHA], s, [], LATER).state, "gaps");
});

const BRAVO = { id: "e-bravo", kind: "epic", name: "26.004.P04 Bravo", keywords: ["bravo"], status_mode: "auto",
  issues: [{ key: "PRJ-78", label: "EXEC · MGMT", phase: "EXEC", role: "MGMT", status_category: "indeterminate" },
           { key: "PRJ-79", label: "EXEC · SD", phase: "EXEC", role: "SD", status_category: "indeterminate" }] };
const P4 = { ...phased("P4 project", ["P4"]), id: "e-p4" };

test("declined/canceled events are dropped before overlaps: bravo 15:30-17:30 + Declined: P4 16:00-17:00 = 2.0h bravo", () => {
  const evs = [ev("bravo E review", MON, "15:30", "17:30"), ev("Declined: P4 E sync", MON, "16:00", "17:00")];
  const d = buildDay(MON, evs, [], [BRAVO, P4], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.issue, e.start_hm, e.end_hm, e.minutes / 60]), [["PRJ-79", "15:30", "17:30", 2]]);
  assert.equal(d.skipped, 1);
  assert.ok(!d.unmatched.some((u) => /P4/.test(u.subject)));
  for (const subj of ["Canceled: P4 E", "Annullata: P4 E", "Rifiutato: P4 E", "Recurring icon, Declined: P4 E", "declined: p4 e"]) {
    const d2 = buildDay(MON, [ev("bravo E", MON, "15:30", "17:30"), ev(subj, MON, "16:00", "17:00")], [], [BRAVO, P4], S, [], LATER);
    assert.deepEqual(d2.entries.map((e) => e.minutes), [120], subj);
  }
  // parser flags count too (events read by outlook-parser.js)
  const d3 = buildDay(MON, [ev("bravo E", MON, "15:30", "17:30"), ev("P4 E sync", MON, "16:00", "17:00", { declined: true })], [], [BRAVO, P4], S, [], LATER);
  assert.deepEqual(d3.entries.map((e) => e.minutes), [120]);
});

test("work before and after the working hours counts; clipping to working hours is optional", () => {
  const evs = [ev("bravo E early", MON, "06:30", "08:00"), ev("bravo E late", MON, "15:30", "19:00")];
  const d = buildDay(MON, evs, [], [BRAVO], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.start_hm, e.end_hm]), [["06:30", "08:00"], ["15:30", "19:00"]]);
  assert.equal(d.planned, 5 * 60);
  assert.equal(d.missing, 3 * 60); // 8h day: 3h still missing, shown inside the working hours
  const clipped = buildDay(MON, evs, [], [BRAVO], { ...S, clip_to_working_hours: true }, [], LATER);
  assert.deepEqual(clipped.entries.map((e) => [e.start_hm, e.end_hm]), [["15:30", "17:00"]]);
  // an event over lunch counts in full
  const lunch = buildDay(MON, [ev("bravo E site", MON, "12:00", "14:00")], [], [BRAVO], S, [], LATER);
  assert.deepEqual(lunch.entries.map((e) => [e.start_hm, e.end_hm]), [["12:00", "14:00"]]);
  // vacation still fills only the working day (8h), not 24h
  const vac = buildDay(MON, [{ subject: "Ferie", start: "2026-11-09T00:00", end: "2026-11-10T00:00", allDay: true, busy: 3 }], [], [], S, [], LATER);
  assert.deepEqual(vac.entries.map((e) => e.minutes), [480]);
});

test("multi-word keywords: every word must be in the title, in any order", () => {
  assert.equal(keywordMatches("echo plc", "PLC test Echo E"), true);
  assert.equal(keywordMatches("echo plc", "Echo E layout"), false);
  assert.equal(keywordMatches("echo plc", "plc test Hotel"), false);
  assert.equal(keywordMatches("bravo", "Bravo E review"), true); // word start
  assert.equal(keywordMatches("plc", "complc sync"), false);
  const NEM = { ...phased("Echo", ["echo plc"]), id: "e-nem" };
  const OTHER = { ...phased("Other plc job", ["plc"]), id: "e-plc", issues: phased("x", []).issues.map((i) => ({ ...i, key: i.key.replace("PRJ", "OTH") })) };
  const d = buildDay(MON, [ev("Echo PLC E check", MON, "08:00", "09:00"), ev("PLC E check", MON, "09:00", "10:00"), ev("Echo E call", MON, "10:00", "11:00")], [], [NEM, OTHER], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.start_hm, e.issue.split("-")[0]]), [["08:00", "PRJ"], ["09:00", "OTH"]]); // the more specific keyword wins
  assert.equal(d.unmatched.length, 1); // "Echo E call" has no "plc"
});

test("edited 'to fill' blocks replace their calendar event; 'don't fill' removes it; posted edits don't bring it back", () => {
  const bravo = ev("bravo E review", MON, "15:30", "17:30");
  const key = eventKey(bravo);
  // moved to 14:00-15:00 on another issue
  const moved = [{ id: "o1", date: MON, start: "14:00", end: "15:00", issue: "PRJ-78", label: "bravo E review", replaces: key }];
  const d = buildDay(MON, [bravo], [], [BRAVO], S, moved, LATER);
  assert.deepEqual(d.entries.map((e) => [e.issue, e.start_hm, e.end_hm, e.source]), [["PRJ-78", "14:00", "15:00", "manual"]]);
  assert.equal(d.segments.find((x) => x.kind === "planned").event_key, key);
  // moved to Tuesday: gone from Monday, there on Tuesday
  const toTue = [{ ...moved[0], date: "2026-11-10" }];
  assert.equal(buildDay(MON, [bravo], [], [BRAVO], S, toTue, LATER).entries.length, 0);
  assert.equal(buildDay("2026-11-10", [bravo], [], [BRAVO], S, toTue, LATER).entries[0].start_hm, "14:00");
  // "don't fill"
  const skip = [{ id: "o2", date: MON, replaces: key, skip: true, label: "bravo E review" }];
  const ds = buildDay(MON, [bravo], [], [BRAVO], S, skip, LATER);
  assert.equal(ds.entries.length, 0);
  assert.deepEqual(ds.dismissed.map((x) => [x.subject, x.override_id]), [["bravo E review", "o2"]]);
  // after posting, the marker keeps the event away and is not shown as dismissed
  const posted = [{ id: "o1", date: MON, replaces: key, skip: true, posted: true }];
  const dp = buildDay(MON, [bravo], [], [BRAVO], S, posted, LATER);
  assert.deepEqual([dp.entries.length, dp.dismissed.length], [0, 0]);
});

test("lunch: an event 12:00-14:00 with lunch 12:30-13:30 counts 2.0h; the lunch band only marks unbooked time", () => {
  const d = buildDay(MON, [ev("bravo E site visit", MON, "12:00", "14:00")], [], [BRAVO], S, [], LATER);
  assert.deepEqual(d.entries.map((e) => [e.start_hm, e.end_hm, e.minutes / 60]), [["12:00", "14:00", 2]]);
  assert.deepEqual(d.segments.filter((x) => x.kind === "lunch"), []); // fully booked: no lunch band
  const half = buildDay(MON, [ev("bravo E call", MON, "12:00", "13:00")], [], [BRAVO], S, [], LATER);
  assert.deepEqual(half.segments.filter((x) => x.kind === "lunch").map((x) => [x.start, x.end]), [[780, 810]]); // 13:00-13:30 free
  // missing time and vacation still never use lunch
  const empty = buildDay(MON, [], [], [BRAVO], S, [], LATER);
  assert.ok(empty.missing_slots.every((m) => m.end <= 750 || m.start >= 810));
  // with "clip to working hours" an event over lunch still counts in full
  const clipped = buildDay(MON, [ev("bravo E site visit", MON, "12:00", "14:00")], [], [BRAVO], { ...S, clip_to_working_hours: true }, [], LATER);
  assert.equal(clipped.planned, 120);
});

test("leave day: all-day out-of-office in Outlook + a LEAVE worklog in Jira = fully booked", () => {
  const oof = { subject: "Ferie", start: "2026-11-09T00:00", end: "2026-11-10T00:00", allDay: true, busy: 3 };
  const halfLeave = [{ id: "1", issue: "LEAVE-1", summary: "VACANZA", start: "2026-11-09T08:00", seconds: 4 * 3600 }];
  const d = buildDay(MON, [oof, ev("bravo E call", MON, "14:00", "15:00")], halfLeave, [BRAVO], S, [], LATER);
  assert.deepEqual([d.state, d.on_leave, d.entries.length, d.missing], ["leave", true, 0, 0]);
  assert.deepEqual(d.segments.filter((x) => x.kind === "logged").map((x) => x.issue), ["LEAVE-1"]); // shown as already logged
  // out-of-office without a leave worklog: vacation is proposed as before
  const d2 = buildDay(MON, [oof], [], [BRAVO], S, [], LATER);
  assert.deepEqual([d2.state, d2.entries.map((e) => [e.issue, e.minutes])], ["ready", [["LEAVE-1", 480]]]);
  // a leave worklog without an all-day out-of-office event: only its hours count
  const d3 = buildDay(MON, [], halfLeave, [BRAVO], S, [], LATER);
  assert.deepEqual([d3.on_leave, d3.missing], [false, 4 * 60]);
});

test("all-day events: 'Delta demo, all day, Wed 4 -> Fri 6 Nov, Busy' fills each working day, never 24h", async () => {
  await import("../extension/outlook-parser.js");
  const P = globalThis.TimefillParser;
  const now = new Date(2026, 10, 12);
  const DELTA = { ...phased("26.007.P07 - Delta", ["delta"]), id: "e-delta", issues: phased("x", []).issues.map((i) => ({ ...i, key: i.key.replace("PRJ", "LND") })) };
  const delta = P.parseLabel("Delta demo, all day event, Wednesday, November 4, 2026 to Friday, November 6, 2026, Busy", { now });
  assert.deepEqual([delta.allDay, delta.start, delta.end], [true, "2026-11-04T00:00", "2026-11-07T00:00"]); // end date inclusive
  const plan = (s, worklogs = [], extra = []) => buildPlan("2026-11-02", "2026-11-08", [delta, ...extra], worklogs, [DELTA], s, [], LATER);
  const hoursPerDay = (p) => p.days.map((d) => d.entries.reduce((a, e) => a + e.minutes, 0) / 60);
  // with 8h every weekday (settings): 3 days x 8h
  assert.deepEqual(hoursPerDay(plan({ ...S, hours_per_weekday: [8, 8, 8, 8, 8, 0, 0] })), [0, 0, 8, 8, 8, 0, 0]);
  // with the default settings Friday is 7h
  assert.deepEqual(hoursPerDay(plan(S)), [0, 0, 8, 8, 7, 0, 0]);
  const wed = plan(S).days[2];
  assert.ok(wed.entries.every((e) => e.issue.startsWith("LND") && e.start >= 480 && e.end <= 1020)); // working hours only
  // minus what is already in Jira that day (Thursday: 3h logged)
  assert.deepEqual(hoursPerDay(plan(S, [{ id: "w", issue: "INT-19", start: "2026-11-05T08:00", seconds: 3 * 3600 }])).slice(2, 5), [8, 5, 7]);
  // a timed meeting that day keeps its own slot; the all-day event fills the rest
  const withCall = plan(S, [], [ev("Delta M call", "2026-11-04", "10:00", "11:00")]).days[2];
  assert.equal(withCall.entries.reduce((a, e) => a + e.minutes, 0), 480);
  assert.ok(withCall.entries.some((e) => e.issue === "LND-223" && e.start_hm === "10:00" && e.end_hm === "11:00"));
});

test("all-day events: weekends skipped, Free reminders without a keyword ignored, OOF with a project keyword is project work", () => {
  const DELTA = { ...phased("26.007.P07 - Delta", ["delta"]), id: "e-delta" };
  const allDay = (subject, from, toExcl, busy) => ({ subject, start: `${from}T00:00`, end: `${toExcl}T00:00`, allDay: true, busy });
  const week = (events) => buildPlan("2026-11-02", "2026-11-08", events, [], [DELTA], S, [], LATER).days.map((d) => d.entries.reduce((a, e) => a + e.minutes, 0) / 60);
  // Fri -> Mon over a weekend: Fri 7h, Sat/Sun nothing
  assert.deepEqual(week([allDay("Delta site", "2026-11-06", "2026-11-10", 2)]), [0, 0, 0, 0, 7, 0, 0]);
  // long reminders shown as Free, no keyword: nothing (would otherwise fill 3 weeks)
  assert.deepEqual(week([allDay("Showroom reminder", "2026-10-26", "2026-11-16", 0), allDay("Long reminder", "2026-11-02", "2026-11-23", 0)]), [0, 0, 0, 0, 0, 0, 0]);
  // a Free one with a project keyword is a candidate, but unticked: nothing until you tick it
  assert.deepEqual(week([allDay("Delta showroom", "2026-11-02", "2026-11-03", 0)]), [0, 0, 0, 0, 0, 0, 0]);
  const showroom = buildPlan("2026-11-02", "2026-11-02", [allDay("Delta showroom", "2026-11-02", "2026-11-03", 0)], [], [DELTA], S, [], LATER).days[0];
  assert.deepEqual(showroom.candidates.map((x) => [x.subject, x.on, x.show_as]), [["Delta showroom", false, "free"]]);
  // out of office + project keyword = on site for that project (not vacation); without keyword = vacation
  const onSite = buildPlan("2026-11-02", "2026-11-02", [allDay("Delta commissioning", "2026-11-02", "2026-11-03", 3)], [], [DELTA], S, [], LATER).days[0];
  assert.deepEqual([...new Set(onSite.entries.map((e) => e.kind))], ["planned"]);
  const away = buildPlan("2026-11-02", "2026-11-02", [allDay("Away", "2026-11-02", "2026-11-03", 3)], [], [DELTA], S, [], LATER).days[0];
  assert.deepEqual(away.entries.map((e) => [e.issue, e.minutes]), [["LEAVE-1", 480]]);
  // declined / cancelled all-day events fill nothing
  assert.deepEqual(week([allDay("Declined: Delta demo", "2026-11-02", "2026-11-05", 2), allDay("Canceled: Delta site", "2026-11-05", "2026-11-06", 2)]), [0, 0, 0, 0, 0, 0, 0]);
});

test("phase words in the title win over the project's status: sdf/feasibility, pre-sale, project, installation", async () => {
  const { detectPhase } = await import("../extension/planner.js");
  // ALPHA is in status "project" (EXEC): PRJ-221 INIT·M, 222 INIT·S, 223 EXEC·M, 224 EXEC·S, 225 COMM·M, 226 COMM·S
  const issueOf = (title) => buildDay(MON, [ev(title, MON, "09:00", "10:00")], [], [ALPHA], S, [], LATER).entries[0]?.issue;
  assert.equal(issueOf("Alpha E review"), "PRJ-224");                 // status -> EXEC
  assert.equal(issueOf("Alpha E installation check"), "PRJ-226");     // COMM · SD
  assert.equal(issueOf("alpha m Commissioning plan"), "PRJ-225");     // COMM · MGMT, any case
  assert.equal(issueOf("Alpha M pre-sale offer"), "PRJ-221");         // INIT · MGMT
  assert.equal(issueOf("Alpha E feasibility"), "PRJ-222");            // no SDF phase -> INIT · SD
  assert.equal(issueOf("Alpha E collaudo"), "PRJ-226");               // Italian
  assert.equal(issueOf("Alpha E installations team"), "PRJ-224");     // whole words only: "installations" is not a phase word
  // a project with an SDF phase: "sdf" picks it
  const NEM = { id: "e-nem", kind: "epic", name: "Echo", keywords: ["echo"], status_mode: "auto", auto_internal: false, issues: [
    { key: "STUDY-78", label: "SDF · SD", phase: "SDF", role: "SD", status_category: "done" },
    { key: "PRJ-229", label: "EXEC · SD", phase: "EXEC", role: "SD", status_category: "indeterminate" }] };
  assert.equal(buildDay(MON, [ev("Echo E SDF report", MON, "09:00", "10:00")], [], [NEM], S, [], LATER).entries[0].issue, "STUDY-78");
  // asked phase missing in Jira -> not matched (never silently another phase)
  const d = buildDay(MON, [ev("Echo E installation", MON, "09:00", "10:00")], [], [NEM], S, [], LATER);
  assert.equal(d.entries.length, 0);
  assert.match(d.unmatched[0].reason, /asks for COMM/);
  assert.deepEqual(detectPhase("Delta E project kickoff", S), ["EXEC"]);
  assert.equal(detectPhase("Delta E weekly", S), null);
});

test("all-day candidates, 2–6 Nov: every all-day event is kept; Thu 5 = [Delta demo ✔, Delta ✔, Alpha training ☐] -> 4h + 4h", () => {
  const DELTA = { ...phased("26.007.P07 - Delta", ["delta"]), id: "e-delta" };
  const allDay = (subject, from, toExcl, busy) => ({ subject, start: `${from}T00:00`, end: `${toExcl}T00:00`, allDay: true, busy });
  const events = [
    allDay("Delta demo", "2026-11-04", "2026-11-07", 2),          // Wed 4 -> Fri 6, Busy
    allDay("Delta", "2026-11-05", "2026-11-06", 2),               // Thu 5, Busy: a second candidate, not a duplicate
    allDay("Alpha training", "2026-11-05", "2026-11-06", 0),  // Thu 5, Free: kept, unticked
  ];
  const plan = (choices = {}, extra = []) => buildPlan("2026-11-02", "2026-11-06", [...events, ...extra], [], [DELTA, ALPHA], S, [], LATER, new Set(), choices);
  const p = plan();
  const thu = p.days[3];
  assert.deepEqual(thu.candidates.map((x) => [x.subject, x.on, x.show_as, x.minutes]),
    [["Delta demo", true, "busy", 240], ["Delta", true, "busy", 240], ["Alpha training", false, "free", 0]]);
  assert.ok(thu.candidates[2].issue); // it has a project, you only need to tick it
  // the multi-day event is one candidate per working day, with the same key
  assert.deepEqual(p.days.map((d) => d.candidates.length), [0, 0, 1, 3, 1]);
  assert.equal(p.days[2].candidates[0].key, thu.candidates[0].key);
  assert.deepEqual(p.days.map((d) => d.planned / 60), [0, 0, 8, 8, 7]);
  // a timed event that day takes its own time first: (8h - 1h) / 2
  const visit = { subject: "Visit", start: "2026-11-05T12:00", end: "2026-11-05T13:00", allDay: false, busy: 2 };
  const thu2 = plan({}, [visit]).days[3];
  assert.deepEqual(thu2.candidates.filter((x) => x.on).map((x) => x.minutes), [210, 210]);
  assert.ok(thu2.segments.filter((x) => x.source === "all_day").every((x) => x.end <= 720 || x.start >= 780)); // not over 12-13
  assert.deepEqual(thu2.all_day_timed.map((x) => x.label), ["Visit"]);
  // your choices: tick the training, type 2h for "Delta" -> the rest is split between the other two
  const key = (i) => `2026-11-05|${thu.candidates[i].key}`;
  const thu3 = plan({ [key(2)]: { on: true }, [key(1)]: { minutes: 120 } }).days[3];
  assert.deepEqual(thu3.candidates.map((x) => x.minutes), [180, 120, 180]);
  assert.equal(thu3.planned, 480);
  // untick everything: nothing is proposed from all-day events that day
  const thu4 = plan({ [key(0)]: { on: false }, [key(1)]: { on: false } }).days[3];
  assert.equal(thu4.planned, 0);
});

test("a project event on a day that already has its hours: reported, and 'Fill it' (a manual entry replacing it) is kept", () => {
  const logged = [{ id: "9", issue: "INT-19", start: `${MON}T08:00`, seconds: 8 * 3600, comment: "" }];
  const cost = ev("Alpha - Cost revision", MON, "17:00", "17:30");
  const before = buildDay(MON, [cost], logged, [ALPHA], S, [], LATER);
  assert.equal(before.planned, 0);
  const d = before.diffs.find((x) => x.side === "calendar");
  assert.equal(d.why, "missing");
  assert.ok(d.issue.startsWith("PRJ-"));
  // "Fill it": an entry that replaces the event, at its time, on the suggested issue
  const fill = [{ id: "f1", date: MON, start: "17:00", end: "17:30", issue: d.issue, label: cost.subject, replaces: d.id.slice(3) }];
  const after = buildDay(MON, [cost], logged, [ALPHA], S, fill, LATER);
  assert.deepEqual(after.entries.map((e) => [e.issue, e.start_hm, e.end_hm]), [[d.issue, "17:00", "17:30"]]);
  assert.deepEqual(after.diffs.filter((x) => x.side === "calendar"), []); // the event is no longer reported
});

test("a block from an all-day event is edited like any other; the other all-day events keep their hours", () => {
  const DELTA = { ...phased("26.007.P07 - Delta", ["delta"]), id: "e-delta" };
  const allDay = (subject, from, toExcl, busy) => ({ subject, start: `${from}T00:00`, end: `${toExcl}T00:00`, allDay: true, busy });
  const THU = "2026-11-05";
  const events = [allDay("Delta demo", "2026-11-04", "2026-11-07", 2), allDay("Delta", THU, "2026-11-06", 2)];
  const day = (overrides = [], choices = {}) => buildPlan(THU, THU, events, [], [DELTA], S, overrides, LATER, new Set(), choices).days[0];
  const before = day();
  const [demo, other] = before.candidates;
  const demoBlock = before.segments.find((x) => x.source === "all_day" && x.label === "Delta demo");
  assert.equal(demoBlock.event_key, `ad:${THU}|${demo.key}`); // edited under this key, that day only
  // you resize "Delta demo" to 09:00-10:30; the app keeps the other event's 4h (frozen as its hours)
  const edit = [{ id: "e1", date: THU, start: "09:00", end: "10:30", issue: demo.issue, label: "Delta demo", replaces: demoBlock.event_key }];
  const after = day(edit, { [`${THU}|${other.key}`]: { minutes: 240 } });
  const [d2, o2] = after.candidates;
  assert.deepEqual([d2.edited, d2.minutes, o2.minutes], [true, 90, 240]);
  assert.equal(after.segments.filter((x) => x.source === "all_day" && x.label === "Delta demo").length, 0); // only your entry
  assert.ok(after.segments.some((x) => x.source === "manual" && x.start === 540 && x.end === 630)); // your block, 09:00-10:30
  assert.equal(after.segments.filter((x) => x.source === "all_day").reduce((n, x) => n + x.end - x.start, 0), 240); // the other: 4h, not more
  // moved to another day: not proposed again on Thursday
  const moved = day([{ ...edit[0], date: "2026-11-06" }]);
  assert.equal(moved.candidates[0].edited, true);
  assert.equal(moved.segments.filter((x) => x.label === "Delta demo").length, 0);
  // in Jira (after posting, a marker stays): not proposed again
  const posted = day([{ id: "e1", date: THU, replaces: demoBlock.event_key, skip: true, posted: true }]);
  assert.deepEqual([posted.candidates[0].posted, posted.segments.filter((x) => x.label === "Delta demo").length], [true, 0]);
});

test("a vacation block can be changed like any other: its event is replaced by your entry, or not filled", () => {
  const ferie = { subject: "Ferie", start: `${MON}T00:00`, end: "2026-11-10T00:00", allDay: true, busy: 3 };
  const before = buildDay(MON, [ferie], [], [ALPHA], S, [], LATER);
  const vac = before.segments.filter((x) => x.kind === "vacation");
  assert.ok(vac.length && vac.every((x) => x.event_key === `ferie|${MON}T00:00`)); // editable under the event's key
  // half a day of vacation instead (your entry replaces the event)
  const half = [{ id: "h1", date: MON, start: "08:00", end: "12:00", issue: "LEAVE-1", label: "Ferie", replaces: vac[0].event_key }];
  const after = buildDay(MON, [ferie], [], [ALPHA], S, half, LATER);
  assert.equal(after.segments.filter((x) => x.kind === "vacation").length, 0);
  assert.deepEqual(after.entries.map((e) => [e.issue, e.start_hm, e.end_hm]), [["LEAVE-1", "08:00", "12:00"]]);
  // "Don't fill": nothing proposed, and it shows as an all-day event you can bring back
  const skipped = buildDay(MON, [ferie], [], [ALPHA], S, [{ id: "s1", date: MON, replaces: vac[0].event_key, skip: true }], LATER);
  assert.equal(skipped.entries.length, 0);
  assert.deepEqual(skipped.dismissed.map((u) => [u.subject, u.all_day]), [["Ferie", true]]);
});

test("what Timefill posted comes back from Jira without orange (back-to-back events, all-day, overlaps, rounding)", () => {
  const BRAVO = { ...phased("26.004.P04 - Bravo Outdoor", ["bravo"]), id: "e-bravo" };
  const allDay = (subject) => ({ subject, start: `${MON}T00:00`, end: "2026-11-10T00:00", allDay: true, busy: 2 });
  const weeks = {
    "two meetings of one project back to back (posted as ONE worklog)": [ev("Alpha E review", MON, "09:00", "10:00"), ev("Alpha E design", MON, "10:00", "11:00")],
    "an event over lunch": [ev("Alpha E workshop", MON, "12:00", "14:00")],
    "overlapping events": [ev("Alpha E focus", MON, "09:00", "11:00"), ev("Bravo M call", MON, "10:00", "10:30")],
    "odd minutes, rounded": [ev("Alpha E sync", MON, "09:05", "09:50")],
    "two all-day events of one project": [allDay("Alpha demo"), allDay("Alpha")],
  };
  for (const [name, events] of Object.entries(weeks)) {
    const plan = buildDay(MON, events, [], [ALPHA, BRAVO], S, [], LATER);
    // what posting writes: one worklog per entry, the comment = the event titles (no links stored: an older post)
    const posted = plan.entries.map((e, i) => ({ id: String(100 + i), issue: e.issue, start: e.started, seconds: e.minutes * 60, comment: e.comment }));
    const after = buildDay(MON, events, posted, [ALPHA, BRAVO], S, [], LATER);
    assert.deepEqual(after.diffs.map((d) => `${d.side} ${d.start_hm}`), [], name);
    assert.equal(after.planned, 0, `${name}: nothing proposed twice`);
  }
});

test("a worklog Timefill posted and you then moved keeps its events: no orange (the link is remembered)", () => {
  const events = [ev("Alpha E review", MON, "09:00", "10:00")];
  const issue = buildDay(MON, events, [], [ALPHA], S, [], LATER).entries[0].issue;
  const moved = [{ id: "77", issue, start: `${MON}T14:00`, seconds: 3600, comment: "Alpha E review" }]; // moved to 14:00 on purpose
  assert.ok(buildDay(MON, events, moved, [ALPHA], S, [], LATER).diffs.length >= 1, "without the link: orange");
  const links = { byId: { 77: { issue, start: `${MON}T14:00`, minutes: 60, event_keys: [`alpha e review|${MON}T09:00`], labels: ["Alpha E review"] } }, byContent: {} };
  const day = buildDay(MON, events, moved, [ALPHA], S, [], LATER, new Set(), {}, links);
  assert.deepEqual(day.diffs, []);
  assert.equal(day.segments.find((x) => x.worklog_id === "77").label, "Alpha E review");
  // an entry you assigned by hand to missing time (comment "manual"): no event to compare with, no orange
  assert.deepEqual(buildDay(MON, [], [{ id: "8", issue, start: `${MON}T16:00`, seconds: 1800, comment: "manual" }], [ALPHA], S, [], LATER).diffs, []);
});

test("an event without a project keyword that you assigned by hand: in Jira, it is not orange and not 'not matched' any more", () => {
  const meeting = ev("Echo process improvements meeting", MON, "10:00", "11:00"); // no keyword of any project
  const before = buildDay(MON, [meeting], [], [ALPHA], S, [], LATER);
  assert.equal(before.unmatched.length, 1);
  // posted earlier (assigned by hand to another issue; the comment is the event title)
  const posted = [{ id: "9", issue: "INT-19", start: `${MON}T10:00`, seconds: 3600, comment: "Echo process improvements meeting" }];
  const after = buildDay(MON, [meeting], posted, [ALPHA], S, [], LATER);
  assert.deepEqual(after.diffs, []);
  assert.deepEqual(after.unmatched, [], "not shown as 'not matched' next to its worklog");
  assert.equal(after.segments.find((x) => x.worklog_id === "9").label, "Echo process improvements meeting");
  // assigning it now replaces the event (remembered, also once posted)
  const assigned = [{ id: "a1", date: MON, start: "10:00", end: "11:00", issue: "INT-19", label: meeting.subject, replaces: before.unmatched[0].key }];
  const planned = buildDay(MON, [meeting], [], [ALPHA], S, assigned, LATER);
  assert.deepEqual([planned.unmatched.length, planned.entries.length], [0, 1]);
  const done = buildDay(MON, [meeting], posted, [ALPHA], S, [{ id: "a1", date: MON, replaces: before.unmatched[0].key, skip: true, posted: true }], LATER);
  assert.deepEqual([done.unmatched.length, done.diffs.length, done.entries.length], [0, 0, 0]);
});

test("an event you assigned by hand (posted by an older version: no event key remembered) is not 'not matched' any more", () => {
  const ev1 = ev("1 2 1 sync", MON, "10:00", "10:30"); // no project keyword
  const posted = [{ id: "5", issue: "INT-19", start: `${MON}T10:00`, seconds: 1800, comment: "1 2 1 sync" }];
  const links = { byId: { 5: { issue: "INT-19", start: `${MON}T10:00`, minutes: 30, event_keys: [], labels: ["1 2 1 sync"] } }, byContent: {} };
  const day = buildDay(MON, [ev1], posted, [ALPHA], S, [], LATER, new Set(), {}, links);
  assert.deepEqual(day.unmatched, []);
  assert.deepEqual(day.diffs, []);
});

test("today: a missing gap that runs past 'now' is cut there (past part missing, the rest future)", () => {
  const now = new Date(2026, 10, 9, 15, 0); // Monday 15:00
  const day = buildDay(MON, [], [], [ALPHA], S, [], now);
  const gaps = day.missing_slots.map((m) => [m.start_hm, m.end_hm, m.future]);
  assert.ok(gaps.some(([a, b, f]) => b === "15:00" && f === false), JSON.stringify(gaps));
  assert.ok(gaps.some(([a, b, f]) => a === "15:00" && f === true), JSON.stringify(gaps));
  assert.equal(day.missing_past, day.missing_slots.filter((m) => !m.future).reduce((n, m) => n + m.minutes, 0));
  assert.ok(day.missing_past < day.missing, "only time already past counts as missing so far");
});

test("declined and cancelled events are never proposed and are listed for the calendar (grey)", () => {
  const evs = [ev("Alpha E review", MON, "09:00", "10:00", { declined: true }), ev("Canceled: Alpha sync", MON, "11:00", "12:00"), ev("Alpha E kept", MON, "14:00", "15:00")];
  const day = buildDay(MON, evs, [], [ALPHA], S, [], LATER);
  assert.deepEqual(day.entries.map((e) => e.start_hm), ["14:00"]);
  assert.deepEqual(day.skipped_events.map((u) => [u.subject, u.start, u.why]), [["Alpha E review", "09:00", "declined"], ["Canceled: Alpha sync", "11:00", "cancelled"]]);
});

test("a declined meeting you fill anyway: your entry takes its place, the grey block goes", () => {
  const meeting = ev("Alpha E review", MON, "09:00", "10:00", { declined: true });
  const before = buildDay(MON, [meeting], [], [ALPHA], S, [], LATER);
  assert.equal(before.skipped_events.length, 1);
  const fill = [{ id: "f1", date: MON, start: "09:00", end: "10:00", issue: "PRJ-224", label: "Alpha E review", replaces: before.skipped_events[0].key }];
  const after = buildDay(MON, [meeting], [], [ALPHA], S, fill, LATER);
  assert.deepEqual(after.skipped_events, []);
  assert.deepEqual(after.entries.map((e) => [e.issue, e.start_hm, e.end_hm]), [["PRJ-224", "09:00", "10:00"]]);
});
