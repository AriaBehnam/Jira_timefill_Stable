// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Numbers for the Charts page, from your Jira worklogs since "Track from".
//   - hours per project (per week or month)
//   - placed (in Jira) vs missing hours (per week or month)
//   - hours per type of work: Pre-sale, Project, Installation, Internal, Training, General, Vacation (per week or month)

import { addDaysIso, dateOf, isoOf, workWindows } from "./planner.js";
import { isInternal, phaseType } from "./projects.js";
import { INTERNAL_TYPES } from "./config.js";

/** Types of work, in fixed order (their chart colors follow this order). */
export const CATEGORIES = [
  { id: "presale", label: "Pre-sale" },      // INIT phases + SDF feasibility studies
  { id: "project", label: "Project" },       // EXEC phases
  { id: "install", label: "Installation" },  // COMM phases (commissioning)
  { id: "internal", label: "Internal" },     // internal projects (each issue can be set to another type)
  { id: "training", label: "Training" },     // set per internal issue (Projects → Internal projects → Chart)
  { id: "general", label: "General" },       // issues outside your projects
  { id: "vacation", label: "Vacation / absence" }, // the vacation issue, and internal issues set to absence
];

/** Monday of the week of a "YYYY-MM-DD" date. */
export const mondayOf = (iso) => addDaysIso(iso, -((dateOf(iso).getDay() + 6) % 7));

function indexIssues(projects) {
  const index = {};
  for (const p of projects) {
    for (const i of p.issues) index[i.key] = { project: p, issue: i };
    if (p.epic && !index[p.epic.key]) index[p.epic.key] = { project: p, issue: null };
    for (const e of p.merged_epics || []) index[e.key] ||= { project: p, issue: null };
  }
  return index;
}

/** Type of work of one issue. */
export function categoryOf(key, index, s) {
  if (s.vacation_issue && key === s.vacation_issue) return "vacation";
  const hit = index[key];
  if (!hit) return "general";
  // an internal issue counts where you chose (Projects → Internal projects → Chart), "internal" by default
  if (isInternal(hit.project)) return INTERNAL_TYPES.includes(hit.issue?.work_type) ? hit.issue.work_type : "internal";
  return phaseType(hit.issue?.phase) || "project"; // a customer project phase not in Settings counts as project work
}

/** Name a worklog's hours are shown under in "hours per project". */
function projectOf(w, index, s) {
  if (s.vacation_issue && w.issue === s.vacation_issue) return null; // vacation is not a project
  const hit = index[w.issue];
  if (hit) return hit.project.name;
  const summary = String(w.summary || "").trim();
  return summary ? summary.split(" · ")[0] : w.issue;
}

const monthKey = (iso) => iso.slice(0, 7);
const monthLabel = (key) => dateOf(`${key}-01`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
const weekLabel = (monday) => dateOf(monday).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * worklogs: [{issue, summary, start:"YYYY-MM-DDTHH:MM", seconds}]
 * Returns { from, to, today, days, weeks, months, projectOrder, categories }. days: [{date, target, logged, missing}].
 * Each period: { key, label, from, to, target, logged, missing, byCategory, byProject } (minutes).
 * Missing = expected hours not in Jira, for finished days only (today is not counted yet).
 */
export function buildReport(worklogs, projects, s, { from, to, today }) {
  const index = indexIssues(projects);
  const perDay = {};
  for (const w of worklogs) {
    const d = w.start.slice(0, 10);
    if (d < from || d > to) continue;
    const day = (perDay[d] ||= { logged: 0, byCategory: {}, byProject: Object.create(null) }); // names from Jira: no built-in keys
    const m = Math.round((w.seconds || 0) / 60);
    day.logged += m;
    const c = categoryOf(w.issue, index, s);
    day.byCategory[c] = (day.byCategory[c] || 0) + m;
    const p = c === "vacation" ? null : projectOf(w, index, s); // vacation / absence is its own slice, not a project
    if (p) day.byProject[p] = (day.byProject[p] || 0) + m;
  }

  const weeks = new Map(), months = new Map(), days = [];
  const bucket = (map, key, make) => map.get(key) || map.set(key, { key, ...make(), target: 0, logged: 0, missing: 0, byCategory: {}, byProject: Object.create(null) }).get(key);
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const target = workWindows(d, s).reduce((a, [x, y]) => a + y - x, 0);
    const day = perDay[d] || { logged: 0, byCategory: {}, byProject: Object.create(null) };
    const missing = d < today ? Math.max(0, target - day.logged) : 0;
    days.push({ key: d, date: d, label: d, from: d, to: d, target, logged: day.logged, missing, byCategory: day.byCategory, byProject: day.byProject });
    const wk = mondayOf(d), mo = monthKey(d);
    for (const b of [bucket(weeks, wk, () => ({ label: weekLabel(wk), from: wk, to: addDaysIso(wk, 6) })),
      bucket(months, mo, () => ({ label: monthLabel(mo), from: `${mo}-01`, to: isoOf(new Date(+mo.slice(0, 4), +mo.slice(5), 0)) }))]) {
      b.target += target; b.logged += day.logged; b.missing += missing;
      for (const [k, v] of Object.entries(day.byCategory)) b.byCategory[k] = (b.byCategory[k] || 0) + v;
      for (const [k, v] of Object.entries(day.byProject)) b.byProject[k] = (b.byProject[k] || 0) + v;
    }
  }

  // stable project order (most hours over the whole range first): a project keeps its color in every week
  const totals = {};
  for (const day of Object.values(perDay)) for (const [k, v] of Object.entries(day.byProject)) totals[k] = (totals[k] || 0) + v;
  const projectOrder = Object.keys(totals).sort((a, b) => totals[b] - totals[a] || a.localeCompare(b));
  return { from, to, today, days, weeks: [...weeks.values()], months: [...months.values()], projectOrder, categories: CATEGORIES };
}
