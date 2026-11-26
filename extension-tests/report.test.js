// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, categoryOf, mondayOf } from "../extension/report.js";
import { DEFAULTS, phased } from "./helpers.js";

// A customer project with all phases (PRJ-221..226: INIT·M, INIT·S, EXEC·M, EXEC·S, COMM·M, COMM·S)
const ALPHA = { ...phased("26.020.P01 Alpha", ["alpha"]), auto_internal: false };
const SDF = { id: "e-sdf", kind: "epic", name: "26.005 - Foxtrot Works", auto_internal: false, keywords: [], status_mode: "auto",
  issues: [{ key: "STUDY-25", label: "SDF · SD", phase: "SDF", role: "SD", status_category: "new" }] };
const GEN = { id: "e-gen", kind: "epic", name: "Internal activities", auto_internal: true, keywords: [], status_mode: "auto",
  issues: [{ key: "INT-19", label: "Meetings", status_category: "new" }] };
const S = { ...DEFAULTS, track_from: "2026-10-01" };
const wl = (issue, start, h, summary = "") => ({ issue, start, seconds: h * 3600, summary });

test("type of work: INIT/SDF = pre-sale, EXEC = project, COMM = installation, internal = general, vacation", () => {
  const index = {};
  for (const p of [ALPHA, SDF, GEN]) for (const i of p.issues) index[i.key] = { project: p, issue: i };
  assert.equal(categoryOf("PRJ-221", index, S), "presale");
  assert.equal(categoryOf("STUDY-25", index, S), "presale");
  assert.equal(categoryOf("PRJ-224", index, S), "project");
  assert.equal(categoryOf("PRJ-226", index, S), "install");
  assert.equal(categoryOf("INT-19", index, S), "internal");
  assert.equal(categoryOf("XYZ-1", index, S), "general"); // not in your projects
  assert.equal(categoryOf("LEAVE-1", index, S), "vacation");
});

test("report: per week and month, hours per project and type, placed vs missing (finished days only)", () => {
  // week of Mon 2 Nov 2026: Mon 8h Alpha EXEC, Tue 4h Foxtrot SDF + 2h internal, Wed vacation 8h, Thu nothing, Fri (today) nothing
  const worklogs = [
    wl("PRJ-224", "2026-11-02T08:00", 8),
    wl("STUDY-25", "2026-11-03T08:00", 4), wl("INT-19", "2026-11-03T13:30", 2),
    wl("LEAVE-1", "2026-11-04T08:00", 8),
    wl("PRJ-226", "2026-10-30T09:00", 7), // Fri 30 Oct: installation, full Friday
    wl("OTHER-9", "2026-10-29T09:00", 1, "26.012.P01 Other job · EXEC · SD"),
  ];
  const r = buildReport(worklogs, [ALPHA, SDF, GEN], S, { from: "2026-10-26", to: "2026-11-06", today: "2026-11-06" });
  assert.deepEqual(r.weeks.map((w) => w.key), ["2026-10-26", "2026-11-02"]);
  const wk = r.weeks[1];
  assert.equal(wk.logged, 22 * 60);
  assert.equal(wk.target, (8 * 4 + 7) * 60);
  // missing: Tue 2h, Thu 8h; Fri is today -> not counted yet
  assert.equal(wk.missing, 10 * 60);
  assert.deepEqual(wk.byCategory, { project: 480, presale: 240, internal: 120, vacation: 480 });
  assert.deepEqual({ ...wk.byProject }, { [ALPHA.name]: 480, "26.005 - Foxtrot Works": 240, "Internal activities": 120 }); // no vacation
  // previous week: installation 7h on Fri, 1h on an issue outside your projects (named from its summary)
  assert.equal(r.weeks[0].byCategory.install, 420);
  assert.equal(r.weeks[0].byProject["26.012.P01 Other job"], 60);
  // months split at the month boundary
  assert.deepEqual(r.months.map((m) => [m.key, m.logged / 60]), [["2026-10", 8], ["2026-11", 22]]);
  // a project keeps its colour: order by total hours over the whole range
  assert.deepEqual(r.projectOrder, [ALPHA.name, "26.005 - Foxtrot Works", "Internal activities", "26.012.P01 Other job"]);
  assert.equal(mondayOf("2026-11-06"), "2026-11-02");
  // per day, for the calendar dots
  const day = Object.fromEntries(r.days.map((d) => [d.date, d]));
  assert.deepEqual([day["2026-11-03"].logged, day["2026-11-03"].missing], [360, 120]);   // partly
  assert.deepEqual([day["2026-11-05"].logged, day["2026-11-05"].missing], [0, 480]);     // nothing in Jira
  assert.deepEqual([day["2026-11-06"].target, day["2026-11-06"].missing], [420, 0]);     // today: not missing yet
});

test("report: days before 'track from' are neither expected nor missing", () => {
  const r = buildReport([], [], { ...DEFAULTS, track_from: "2026-11-04" }, { from: "2026-11-02", to: "2026-11-06", today: "2026-11-07" });
  assert.equal(r.weeks[0].target, (8 * 2 + 7) * 60); // Wed..Fri only
  assert.equal(r.weeks[0].missing, (8 * 2 + 7) * 60);
});

test("an internal issue counts in the chart you chose for it (default: internal)", () => {
  const TRAINING = { ...GEN, issues: [{ ...GEN.issues[0], work_type: "install" }, { key: "INT-20", label: "Admin", status_category: "new" }] };
  const index = {};
  for (const i of TRAINING.issues) index[i.key] = { project: TRAINING, issue: i };
  assert.equal(categoryOf("INT-19", index, S), "install");
  assert.equal(categoryOf("INT-20", index, S), "internal");
  assert.equal(categoryOf("INT-21", { "INT-21": { project: TRAINING, issue: { key: "INT-21", work_type: "training" } } }, S), "training");
  // an absence issue (e.g. leave for a medical visit) counts as vacation / absence, and not also under its project
  const ABS = { ...GEN, id: "e-abs", name: "Internal tasks", issues: [{ key: "INT-30", label: "Absence / permit", status_category: "new", work_type: "vacation" }] };
  const r2 = buildReport([wl("INT-30", "2026-11-03T08:00", 2)], [ABS], S, { from: "2026-11-02", to: "2026-11-06", today: "2026-11-06" });
  assert.equal(r2.weeks[0].byCategory.vacation, 120);
  assert.deepEqual({ ...r2.weeks[0].byProject }, {});
  const r = buildReport([wl("INT-19", "2026-11-03T08:00", 2)], [TRAINING], S, { from: "2026-11-02", to: "2026-11-06", today: "2026-11-06" });
  assert.equal(r.weeks[0].byCategory.install, 120);
});
