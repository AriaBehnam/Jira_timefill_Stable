// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

// Turns calendar events + your existing Jira worklogs into a per-day fill plan.
//
// Priority when time overlaps (earlier wins):
//   1. what is already logged in Jira (never touched)
//   2. manual assignments made on the Status page
//   3. vacation
//   4. project events, shortest first (so a 1h meeting beats a long focus block)
// Lunch and anything outside working hours is never filled.
//
// Dates are "YYYY-MM-DD" strings, date-times "YYYY-MM-DDTHH:MM" local wall-clock strings.

import { defaultRoleOf, phasesOf, rolesOf } from "./config.js";
import { isInternal, issueFor } from "./projects.js";

export const OOF = 3;
const pad = (n) => String(n).padStart(2, "0");

export function splitList(v) {
  // commas, semicolons and new lines separate items, also inside a list that was saved as an array
  const parts = Array.isArray(v) ? v.flatMap((x) => String(x ?? "").split(/[,;\n]/)) : String(v ?? "").split(/[,;\n]/);
  return parts.map((x) => x.trim()).filter(Boolean);
}

export function hm(s) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s));
  if (!m || +m[1] > 24 || +m[2] > 59 || (+m[1] === 24 && +m[2] > 0)) throw new Error(`"${s}" must be a time from 00:00 to 24:00`);
  return +m[1] * 60 + +m[2];
}

export const fmt = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function dateOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysIso = (iso, n) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const localStamp = (d) => `${isoOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const weekdayIdx = (iso) => (dateOf(iso).getDay() + 6) % 7; // 0 = Monday

export function subtract(ivs, s, e) {
  const out = [];
  for (const [a, b] of ivs) {
    if (e <= a || s >= b) { out.push([a, b]); continue; }
    if (a < s) out.push([a, s]);
    if (e < b) out.push([e, b]);
  }
  return out;
}

export const intersect = (ivs, s, e) =>
  ivs.filter(([a, b]) => Math.min(b, e) > Math.max(a, s)).map(([a, b]) => [Math.max(a, s), Math.min(b, e)]);

/** Days before the "track from" date are not checked at all. */
export const beforeStart = (day, s) => !!s.track_from && day < s.track_from;

export function workWindows(day, s) {
  if (beforeStart(day, s) || splitList(s.holidays).includes(day)) return [];
  const total = Math.round(parseFloat(s.hours_per_weekday[weekdayIdx(day)] || 0) * 60);
  if (total <= 0) return [];
  const ds = hm(s.day_start), ls = hm(s.lunch_start), le = hm(s.lunch_end);
  const morning = Math.max(0, ls - ds);
  if (total <= morning) return [[ds, ds + total]];
  return [[ds, ls], [le, le + total - morning]];
}

/** Minutes [start, end) of an event on a given day (wall clock), or null. */
export function daySpan(start, end, day) {
  const d0 = `${day}T00:00`, d1 = `${addDaysIso(day, 1)}T00:00`;
  const s = start > d0 ? start : d0;
  const e = end < d1 ? end : d1;
  if (e <= s) return null;
  const toMin = (stamp) => (stamp === d1 ? 1440 : hm(stamp.slice(11, 16)));
  return [toMin(s), toMin(e)];
}

/** Longest keyword wins: {project, issue|null} or null. Internal projects have keywords per issue. */
/**
 * A keyword matches when EVERY word of it is in the title, in any order, case-insensitive:
 * "echo plc" matches "PLC test Echo" but not "plc test Hotel". Each word must start a word in the
 * title ("bravo" matches "Bravo", "plc" does not match "complc"). Commas separate keywords.
 */
export function keywordMatches(keyword, subject) {
  const words = String(keyword).toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w)}`, "iu").test(subject));
}

export function matchTarget(subject, projects) {
  let best = null;
  // most specific keyword wins: more words first, then the longer one
  const offer = (kw, hit) => {
    if (!keywordMatches(kw, subject)) return;
    const words = String(kw).trim().split(/\s+/).length, len = String(kw).trim().length;
    if (!best || words > best.words || (words === best.words && len > best.len)) best = { words, len, ...hit };
  };
  for (const p of projects) {
    if (isInternal(p)) { for (const i of p.issues) for (const kw of splitList(i.keywords)) offer(kw, { project: p, issue: i.key }); }
    else for (const kw of splitList(p.keywords)) offer(kw, { project: p, issue: null });
  }
  return best && { project: best.project, issue: best.issue };
}
export const matchProject = (subject, projects) => matchTarget(subject, projects)?.project || null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The role an event title asks for (its role words, e.g. "E" / "M"), else the default role. */
export function detectRole(subject, s) {
  for (const r of rolesOf(s))
    for (const tok of splitList(r.words))
      if (new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(tok)}(?![\\p{L}\\p{N}_])`, "iu").test(subject)) return r.token;
  return defaultRoleOf(s);
}

/**
 * Phase tokens a title asks for through the phase words (first word found in the title wins), or null.
 * The chosen phase comes first, then the other phases of the same type of work (e.g. feasibility -> the other
 * pre-sale phase when the project has no feasibility phase).
 */
export function detectPhase(subject, s) {
  let best = null;
  for (const p of phasesOf(s))
    for (const w of splitList(p.words)) {
      const m = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(w)}(?![\\p{L}\\p{N}_])`, "iu").exec(subject);
      if (m && (!best || m.index < best.at)) best = { at: m.index, phase: p };
    }
  if (!best) return null;
  return [best.phase.token, ...phasesOf(s).filter((p) => p.type === best.phase.type && p.token !== best.phase.token).map((p) => p.token)];
}

export function classify(ev, projects, s) {
  const subj = (ev.subject || "").trim();
  const low = subj.toLowerCase();
  if (splitList(s.ignore_keywords).some((k) => low.includes(k.toLowerCase())))
    return { type: "ignored", reason: "matches an ignore keyword" };
  const vacKw = splitList(s.vacation_keywords).some((k) => low.includes(k.toLowerCase()));
  const oof = ev.busy === OOF && s.use_oof_status !== false;
  const vacation = { type: "vacation", issue: s.vacation_issue };
  if (ev.allDay && vacKw) return vacation;
  // a project keyword wins over the out-of-office status ("Delta commissioning", shown as Out of office = on site)
  const hit = matchTarget(subj, projects);
  if (hit?.issue) return { type: "project", issue: hit.issue, project: hit.project.name, role: null };
  const proj = hit?.project;
  if (proj) {
    const role = detectRole(subj, s);
    const [key, why] = issueFor(proj, role, detectPhase(subj, s));
    if (key) return { type: "project", issue: key, project: proj.name, role };
    return { type: "unmatched", reason: `${proj.name}: ${why}` };
  }
  if (vacKw) return vacation;
  if (ev.allDay && oof) return vacation;
  // all-day events without a keyword (reminders like "Showroom reminder", usually shown as Free) fill nothing
  if (ev.allDay) return { type: "ignored", reason: ev.busy === 0 ? "all-day reminder (shown as Free), no project keyword" : "all-day event without a project keyword" };
  if (oof) return { type: "unmatched", reason: "out-of-office without a vacation keyword" };
  return { type: "unmatched", reason: "no project keyword in the title" };
}

/** Short stable hash (for approval ids). */
export function shortHash(text) {
  let h = 5381;
  for (const ch of String(text || "")) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

const roundTo = (m, r) => (r > 1 ? Math.round(m / r) * r : m);

// Cancelled / declined events never take time. outlook-parser.js already skips them when reading,
// this also covers events cached by older versions. Optional leading "<something> icon, " parts are allowed.
const SKIP_RE = /^(?:[^,]{1,40}\s+icon,\s*)*(?:declined|canceled|cancelled|annullat[ao]|rifiutat[ao])\s*[:\-]/i;
/** Identity of a calendar event (same rule as the Outlook reader's de-dupe): title + start. */
export const eventKey = (ev) => `${String(ev.subject || "").toLowerCase()}|${ev.start}`;

/** Identity of an all-day event: title + start + end. The same key on every day of a multi-day event. */
export const allDayKey = (ev) => `${String(ev.subject || "").replace(/\s+/g, " ").trim().toLowerCase()}|${ev.start}|${ev.end}`;
const FREE = 0;
const SHOW_AS = ["free", "tentative", "busy", "oof", "elsewhere"];

export const isSkippedEvent = (ev) => !!(ev.cancelled || ev.declined || SKIP_RE.test(String(ev.subject || "").trim()));

/**
 * events:   [{subject, start, end, allDay, busy}]
 * worklogs: [{issue, summary, start:"YYYY-MM-DDTHH:MM", seconds}]
 * overrides:[{id, date, start:"HH:MM", end, issue, label, replaces?, skip?, posted?}]
 *   replaces = eventKey of the calendar event this manual entry replaces (edited on the Status page);
 *   skip     = that event is not filled at all ("Don't fill"); posted = replaced, and already in Jira.
 */
export function buildDay(day, events, worklogs, projects, s, overrides, now, ignoredDiffs = new Set(), allDayChoices = {}, links = {}) {
  const windows = workWindows(day, s);
  const target = windows.reduce((a, [x, y]) => a + y - x, 0);
  const rnd = parseInt(s.rounding_minutes, 10) || 1;
  const isFuture = (minute) => { const d = dateOf(day); d.setMinutes(minute); return d > now; };
  const inWindows = (ivs) => windows.flatMap(([a, b]) => intersect(ivs, a, b));
  // Where calendar time may be logged: the whole day (work before/after hours counts), or only from the
  // day's start to its end when "clip to working hours" is on. Events that overlap lunch count in FULL:
  // lunch is only "not filled" for missing time and vacation. Days before "track from": nothing.
  let free = beforeStart(day, s) ? []
    : s.clip_to_working_hours ? (windows.length ? [[windows[0][0], windows[windows.length - 1][1]]] : [])
    : [[0, 1440]];
  const segments = [], loggedItems = [], loggedSegs = [];

  for (const w of worklogs) {
    if (w.start.slice(0, 10) !== day) continue;
    const st = hm(w.start.slice(11, 16));
    const en = Math.min(1440, st + Math.round(w.seconds / 60));
    // label = the calendar event this worklog belongs to (set by compareDay below), else the worklog comment
    const seg = { start: st, end: en, kind: "logged", issue: w.issue, label: w.comment || "", worklog_id: w.id ?? null };
    segments.push(seg);
    loggedSegs.push({ seg, w });
    loggedItems.push({ issue: w.issue, summary: w.summary || "", start: fmt(st), end: fmt(en), minutes: Math.round(w.seconds / 60) });
    free = subtract(free, st, en);
  }

  // Hours count, not clock times: what you log in Jira for a day often doesn't start at 08:00
  // (e.g. one 8h worklog at 09:00). Once the day's Jira total reaches the expected hours, the day
  // is complete and nothing more is proposed.
  const loggedToday = loggedItems.reduce((a, i) => a + i.minutes, 0);
  // What you assign yourself is always kept (also on a day that already has its hours): only Jira is in the way.
  let manualFree = free;
  if (target > 0 && loggedToday >= target) free = [];
  // Leave day: an all-day out-of-office / vacation event in Outlook AND a worklog on the leave issue (LEAVE)
  // in Jira = the day is fully booked, even if the leave worklog is shorter or at another time. Nothing more
  // is proposed and nothing is missing.
  const leaveLogged = !!s.vacation_issue && loggedItems.some((i) => i.issue === s.vacation_issue);
  const oofAllDay = !beforeStart(day, s) && events.some((ev) => ev.allDay && !isSkippedEvent(ev) && daySpan(ev.start, ev.end, day)
    && (ev.busy === OOF || classify(ev, projects, s).type === "vacation"));
  const onLeave = leaveLogged && oofAllDay;
  if (onLeave) free = [];

  const cands = [], unmatched = [], ignored = [], dismissed = [], allDayEvents = [];
  let skipped = 0;
  // calendar events you edited (moved, resized, other issue, "don't fill") -> event key -> overrides
  const replaced = new Map();
  for (const o of overrides) if (o.replaces) replaced.set(o.replaces, [...(replaced.get(o.replaces) || []), o]);
  for (const o of overrides)
    if (o.date === day && !o.skip && !beforeStart(day, s))
      cands.push([0, 0, hm(o.start), hm(o.end), { issue: o.issue, label: o.label || "manual", kind: "planned", source: "manual", override_id: o.id, replaces: o.replaces || null }]);
  for (const ev of beforeStart(day, s) ? [] : events) {
    if (isSkippedEvent(ev)) { skipped++; continue; } // removed BEFORE overlaps are resolved
    const span = daySpan(ev.start, ev.end, day);
    if (!span) continue;
    let [st, en] = span;
    const key = eventKey(ev);
    const info = { key, subject: ev.subject, start: fmt(st), end: fmt(en), s: st, e: en, all_day: !!ev.allDay, busy: ev.busy };
    const edits = replaced.get(key);
    if (edits) { // you changed this event on the Status page: your version is used instead
      const skip = edits.find((o) => o.skip && !o.posted);
      if (skip && edits.every((o) => o.skip)) dismissed.push({ ...info, override_id: skip.id });
      continue;
    }
    const c = classify(ev, projects, s);
    if (c.type === "vacation") {
      cands.push([1, 0, st, en, { issue: c.issue, label: ev.subject, kind: "vacation", source: "vacation", event_key: key }]);
    } else if (ev.allDay && windows.length && c.reason !== "matches an ignore keyword") {
      // All-day events on a working day are candidates for the day: every one is kept (also Free ones, and two
      // with similar titles), and you choose which to fill and how many hours (see allDayCandidates below).
      allDayEvents.push({ ev, c });
    } else if (c.type === "project" && ev.allDay) {
      // weekend / holiday: no working hours, nothing to fill
    } else if (c.type === "project") {
      st = roundTo(st, rnd); en = roundTo(en, rnd);
      if (en > st) cands.push([2, en - st, st, en, { issue: c.issue, label: ev.subject, kind: "planned", source: "calendar", project: c.project, role: c.role, event_key: key }]);
    } else if (c.type === "unmatched") unmatched.push({ ...info, reason: c.reason });
    else ignored.push({ ...info, reason: c.reason });
  }

  const pieces = [];
  cands.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  // Calendar events are shown exactly like the calendar: two events at the same time are BOTH proposed in full
  // (side by side), never cut into pieces by each other. You split them yourself. They are still cut by what is
  // already in Jira and by your manual entries.
  let calFree = free;
  for (const [, , st, en, info] of cands) {
    const asInCalendar = info.source === "calendar";
    // vacation fills working hours only (never lunch, never 24h)
    const area = asInCalendar ? calFree : info.kind === "vacation" ? inWindows(free) : info.source === "manual" ? manualFree : free;
    for (const [a, b] of intersect(area, st, en)) {
      pieces.push({ start: a, end: b, ...info });
      free = subtract(free, a, b);
      if (info.source === "manual") { calFree = subtract(calFree, a, b); manualFree = subtract(manualFree, a, b); }
    }
  }
  // all your entries: one that replaces this day's all-day event may have been moved to another day
  const allDay = allDayCandidates(day, allDayEvents, unmatched, pieces, free, windows, target, loggedToday, rnd, allDayChoices, overrides);
  pieces.push(...allDay.pieces);
  for (const p of allDay.pieces) free = subtract(free, p.start, p.end);
  // Missing = free working-hour slots, but only as many hours as the day still needs
  // (time worked outside the working hours counts too). Earliest slots first.
  let budget = Math.max(0, target - loggedToday - pieces.reduce((a, p) => a + p.end - p.start, 0));
  free = inWindows(free).sort((x, y) => x[0] - y[0]).flatMap(([a, b]) => {
    if (budget <= 0) return [];
    const e = Math.min(b, a + budget);
    budget -= e - a;
    return [[a, e]];
  });

  // Merge touching pieces of the same issue; vacation becomes one entry for the whole day.
  const entries = [];
  for (const p of [...pieces].sort((a, b) => a.start - b.start)) {
    const last = entries[entries.length - 1];
    if (last && last.issue === p.issue && last.kind === p.kind && (p.kind === "vacation" || last.end === p.start)) {
      last.end = p.end;
      last.minutes += p.end - p.start;
      if (!last.labels.includes(p.label)) last.labels.push(p.label);
      if (p.override_id) last.override_ids.push(p.override_id);
      const k = p.event_key || p.replaces;
      if (k && !last.event_keys.includes(k)) last.event_keys.push(k);
    } else {
      const k = p.event_key || p.replaces;
      entries.push({ issue: p.issue, kind: p.kind, source: p.source, start: p.start, end: p.end, minutes: p.end - p.start,
        labels: [p.label], override_ids: p.override_id ? [p.override_id] : [], event_keys: k ? [k] : [] });
    }
  }
  const useComment = s.comment_with_subject !== false;
  for (const en of entries) {
    en.future = isFuture(en.end);
    en.started = `${day}T${fmt(en.start)}`;
    en.comment = useComment && en.kind !== "vacation" ? en.labels.join("; ").slice(0, 250) : "";
    en.start_hm = fmt(en.start);
    en.end_hm = fmt(en.end);
    // Stable id used for approval: if anything about the worklog changes, the id changes too.
    // (the comment is part of it: if the calendar title changes after review, the entry needs a new approval)
    en.id = `${day}|${en.issue}|${en.start_hm}|${en.minutes}|${shortHash(en.comment)}`;
  }

  for (const p of pieces)
    segments.push({ start: p.start, end: p.end, kind: p.kind, issue: p.issue, label: p.label, future: isFuture(p.end), source: p.source,
      override_id: p.override_id || null, event_key: p.event_key || p.replaces || null });
  const diffs = beforeStart(day, s) || onLeave ? { list: [], ignored: [] }
    : compareDay(day, events, loggedSegs, pieces, projects, s, overrides, rnd, ignoredDiffs, segments, links);
  for (let i = unmatched.length - 1; i >= 0; i--) if (diffs.linked?.has(unmatched[i].key)) unmatched.splice(i, 1);
  const missing = free.map(([a, b]) => ({ start: a, end: b, start_hm: fmt(a), end_hm: fmt(b), minutes: b - a, future: isFuture(b) }));
  for (const m of missing) segments.push({ start: m.start, end: m.end, kind: "missing", future: m.future });
  // the lunch band marks only lunch time that nothing is booked on
  if (windows.length === 2) {
    let lunchFree = [[windows[0][1], windows[1][0]]];
    for (const x of segments) if (x.kind !== "missing" && x.kind !== "diff") lunchFree = subtract(lunchFree, x.start, x.end);
    for (const [a, b] of lunchFree) segments.push({ start: a, end: b, kind: "lunch" });
  }
  segments.sort((a, b) => a.start - b.start);

  const logged = loggedToday;
  const planned = entries.reduce((a, e) => a + e.minutes, 0);
  const missPast = missing.filter((m) => !m.future).reduce((a, m) => a + m.minutes, 0);
  let state;
  if (beforeStart(day, s)) state = "untracked";
  else if (onLeave) state = "leave";
  else if (!windows.length && !entries.length) state = "off"; // weekend/holiday work is still proposed
  else if (missPast) state = "gaps";
  else if (entries.some((e) => !e.future)) state = "ready";
  else if (missing.length || entries.length) state = "upcoming";
  else state = "complete";
  return {
    date: day, working: windows.length > 0, target, logged, planned,
    missing: missing.reduce((a, m) => a + m.minutes, 0), missing_past: missPast, state,
    segments, entries, missing_slots: missing, logged_items: loggedItems, unmatched, ignored, skipped, dismissed, on_leave: onLeave,
    diffs: diffs.list, diffs_ignored: diffs.ignored,
    candidates: allDay.list, all_day_room: allDay.room, all_day_timed: allDay.timed, // candidates = every all-day event of the day
    overrides: overrides.filter((o) => o.date === day),
  };
}

export function buildPlan(from, to, events, worklogs, projects, s, overrides, now, ignoredDiffs = new Set(), allDayChoices = {}, links = {}) {
  const days = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) days.push(buildDay(d, events, worklogs, projects, s, overrides, now, ignoredDiffs, allDayChoices, links));
  const totals = {};
  for (const k of ["target", "logged", "planned", "missing", "missing_past"]) totals[k] = days.reduce((a, x) => a + x[k], 0);
  return { from, to, days, totals };
}

/* ------------------------------------------------------------------ Jira vs. calendar */
const norm = (v) => String(v || "").replace(/\s+/g, " ").trim().toLowerCase();
const overlaps = (a, b) => a.s < b.e && b.s < a.e;

/** issue key -> project name, for "same project" comparisons (an issue outside your projects is its own project) */
function projectOfIssue(projects) {
  const map = new Map();
  for (const p of projects || []) for (const i of p.issues || []) map.set(i.key, p.name);
  return (key) => map.get(key) || key;
}

/**
 * Differences between what is in Jira and what is in your calendar on one day.
 *   side "jira":     a worklog with no calendar event at that time for that project
 *                    (why "time": the calendar has the project at another time; why "missing": not in the calendar)
 *   side "calendar": a project event that is neither in Jira nor proposed
 *                    (why "time": Jira has the project at another time; why "other": that time is logged on other
 *                    issues; why "missing": not in Jira, the day already has its hours)
 * A worklog and an event belong together when they are on the same project at (about) the same time, or the
 * worklog's comment is the event title. Ignored differences (by id) are not reported.
 * Sets the label of each logged segment to its calendar event title, and adds a "diff" segment per calendar side.
 */
/** The key under which Timefill remembers a worklog it posted: issue | start | minutes. */
export const linkKey = (issue, start, minutes) => `${issue}|${start}|${Math.round(minutes)}`;

function compareDay(day, events, loggedSegs, pieces, projects, s, overrides, rnd, ignoredDiffs, segments, links = {}) {
  const projOf = projectOfIssue(projects);
  const tol = Math.max(5, rnd);
  const edited = new Set(overrides.filter((o) => o.replaces).map((o) => o.replaces));
  const cal = [];
  for (const ev of events) {
    if (isSkippedEvent(ev)) continue;
    const span = daySpan(ev.start, ev.end, day);
    if (!span) continue;
    const c = classify(ev, projects, s);
    // every event takes part (one without a project keyword may be in Jira because you assigned it by hand);
    // only events with a project can be reported as "not in Jira"
    const hasProject = c.type === "project" || c.type === "vacation";
    const key = eventKey(ev);
    cal.push({ key, subject: ev.subject, s: span[0], e: span[1], all_day: !!ev.allDay, issue: hasProject ? c.issue : null,
      project: hasProject ? projOf(c.issue) : null, vacation: c.type === "vacation", edited: edited.has(key), linked: false });
  }
  const timed = cal.filter((e) => e.project && !e.all_day && !e.vacation && !e.edited);
  // every other timed event of the day (any title), to see whether a longer/shorter worklog runs into them
  const busyTimes = [];
  for (const ev of events) {
    if (ev.allDay || isSkippedEvent(ev)) continue;
    const span = daySpan(ev.start, ev.end, day);
    if (span) busyTimes.push({ key: eventKey(ev), s: span[0], e: span[1] });
  }
  // A worklog and an event of the same project where one covers the other, and the extra time doesn't run into
  // any other event: the same thing, just longer or shorter. Not a difference.
  const covers = (e, W) => {
    const inner = e.s <= W.s && W.e <= e.e, outer = W.s <= e.s && e.e <= W.e;
    if (!inner && !outer) return false;
    const lo = Math.min(e.s, W.s), hi = Math.max(e.e, W.e);
    return !busyTimes.some((b) => b.key !== e.key && b.s < hi && lo < b.e && !(b.s >= e.s && b.e <= e.e));
  };
  const list = [];
  const ignored = []; // ids of the differences you ignored (so the week can show them again)
  const report = (d) => { if (ignoredDiffs.has(d.id)) { ignored.push(d.id); return false; } list.push(d); return true; };
  const at = (x) => ({ start_hm: fmt(x.s), end_hm: fmt(x.e) });

  for (const { seg, w } of loggedSegs) {
    const W = { s: seg.start, e: seg.end, project: projOf(w.issue) };
    if (s.vacation_issue && w.issue === s.vacation_issue) continue; // leave: compared by the leave-day rule
    // 1) Timefill posted (or moved) this worklog itself: it belongs to the events it was made from, nothing to compare
    const link = (w.id != null && links.byId?.[String(w.id)]) || links.byContent?.[linkKey(w.issue, w.start, w.seconds / 60)];
    if (link) {
      for (const e of cal) if ((link.event_keys || []).some((k) => k === e.key || k.endsWith(`|${e.key}`))) e.linked = true;
      seg.label = (link.labels || []).filter((l) => l && l !== "manual").join("; ") || seg.label;
      continue;
    }
    // an entry you assigned by hand (posted by Timefill as "manual"): there is no calendar event to compare with
    if (norm(w.comment) === "manual") continue;
    const same = timed.filter((e) => e.project === W.project);
    let ev = same.find((e) => Math.abs(e.s - W.s) <= tol && Math.abs(e.e - W.e) <= tol) || same.find((e) => covers(e, W));
    // 2) one worklog made of several events back to back (comment "A; B"): it matches them when together they
    //    cover it exactly (Timefill joins touching events of the same issue into one worklog)
    if (!ev && String(w.comment || "").includes("; ")) {
      const names = new Set(String(w.comment).split(";").map(norm).filter(Boolean));
      const parts = cal.filter((e) => names.has(norm(e.subject)) && (e.project === W.project || !e.project) && (e.all_day || (e.s >= W.s - tol && e.e <= W.e + tol)));
      const timedParts = parts.filter((e) => !e.all_day).sort((a, b) => a.s - b.s);
      let reach = W.s, joined = timedParts.length > 0 || parts.some((e) => e.all_day);
      for (const e of timedParts) { if (e.s > reach + tol) { joined = false; break; } reach = Math.max(reach, e.e); }
      if (timedParts.length && Math.abs(reach - W.e) > tol) joined = false;
      if (joined && parts.length) { for (const e of parts) e.linked = true; seg.label = parts.map((e) => e.subject).join("; "); continue; }
    }
    const byTitle = !ev && w.comment ? cal.find((e) => norm(e.subject) === norm(w.comment)) : null;
    // the worklog's comment names an event: same event, unless it is a timed one at another time
    if (byTitle && (byTitle.all_day || byTitle.edited || (Math.abs(byTitle.s - W.s) <= tol && Math.abs(byTitle.e - W.e) <= tol))) ev = byTitle;
    if (ev) { ev.linked = true; seg.label = ev.subject; continue; }
    const elsewhere = byTitle && !byTitle.all_day ? [byTitle] : same;
    // keyed by what the worklog is (issue, start, length), not its id: an id changes once a just-posted worklog is
    // read back from Jira, and the "ignore" must stay. (Older ignores by id still count.)
    const contentId = `wl:${w.issue}|${w.start}|${Math.round(w.seconds / 60)}`;
    if (ignoredDiffs.has(`wl:${w.id}`)) { ignored.push(`wl:${w.id}`); continue; }
    const d = { id: contentId, side: "jira", why: elsewhere.length ? "time" : "missing", issue: w.issue, comment: w.comment || "",
      start: W.s, end: W.e, ...at(W), worklog_id: w.id ?? null,
      calendar: (elsewhere.length ? elsewhere : timed.filter((e) => overlaps(e, W))).map((e) => ({ subject: e.subject, ...at(e) })) };
    if (report(d)) seg.diff = d.id;
  }

  const plannedKeys = new Set(pieces.map((p) => p.event_key).filter(Boolean));
  for (const ev of timed) {
    if (ev.linked || plannedKeys.has(ev.key)) continue;
    const same = loggedSegs.filter(({ w }) => projOf(w.issue) === ev.project);
    const over = loggedSegs.filter(({ seg }) => overlaps({ s: seg.start, e: seg.end }, ev));
    const why = same.length ? "time" : over.length ? "other" : "missing";
    const jira = (same.length ? same : over).map(({ seg, w }) => ({ issue: w.issue, start_hm: fmt(seg.start), end_hm: fmt(seg.end) }));
    const d = { id: `ev:${ev.key}`, side: "calendar", why, subject: ev.subject, issue: ev.issue, start: ev.s, end: ev.e, ...at(ev), jira };
    if (report(d)) segments.push({ start: ev.s, end: ev.e, kind: "diff", issue: ev.issue, label: ev.subject, diff: d.id });
  }
  return { list, ignored, linked: new Set(cal.filter((e) => e.linked).map((e) => e.key)) };
}

/* ------------------------------------------------------------------ all-day candidates */
const union = (ivs) => {
  const out = [];
  for (const [a, b] of [...ivs].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
};

/**
 * All-day events of one working day, as a list you choose from (never "one all-day event per day"):
 *   - every event is kept, de-duplicated only by title + start + end; a multi-day event is a candidate on each
 *     of its working days, with the same key;
 *   - Busy / Tentative / Out-of-office events with a project start ticked; Free ones, and ones without a project,
 *     start unticked (you can tick them and pick a project);
 *   - the ticked ones share what the day still has: expected hours - Jira - timed events of the day (events
 *     to fill, your manual entries, and events still without a project); a split in steps of the rounding;
 *   - your choices per day + event (choices["<day>|<key>"] = {on, issue, minutes}) replace the defaults.
 *     Hours you typed are kept even if the day goes over its expected hours.
 * The hours are placed in the free working time of the day, then after it if you asked for more.
 */
/** The key a block filled from an all-day event is edited under (that day only): "ad:<day>|<event key>". */
export const allDayEditKey = (day, key) => `ad:${day}|${key}`;

function allDayCandidates(day, allDayEvents, unmatched, pieces, free, windows, target, loggedToday, rnd, choices, dayOverrides = []) {
  const seen = new Set(), list = [];
  for (const { ev, c } of allDayEvents) {
    const key = allDayKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    const ch = choices[`${day}|${key}`] || {};
    const suggested = c.type === "project" || c.type === "vacation" ? c.issue || null : null;
    // You changed its block on the calendar (moved, resized, other project): your entries replace it that day.
    const editKey = allDayEditKey(day, key);
    const mine = dayOverrides.filter((o) => o.replaces === editKey);
    const kept = mine.filter((o) => !o.skip);
    list.push({
      edit_key: editKey, edited: kept.length > 0, posted: mine.some((o) => o.posted), override_ids: kept.map((o) => o.id),
      edited_minutes: kept.reduce((n, o) => n + hm(o.end) - hm(o.start), 0),
      key, subject: ev.subject, show_as: SHOW_AS[ev.busy] || "busy", project: c.project || (c.type === "vacation" ? "Vacation" : null),
      suggested_issue: suggested, issue: ch.issue || suggested, reason: suggested ? "" : c.reason || "no project keyword in the title",
      on: mine.length && !kept.length && !mine.some((o) => o.posted) ? false // "Don't fill" on its block
        : typeof ch.on === "boolean" ? ch.on : !!suggested && ev.busy !== FREE,
      user_minutes: Number.isFinite(ch.minutes) ? ch.minutes : null, changed: !!(ch.issue || typeof ch.on === "boolean" || Number.isFinite(ch.minutes)),
    });
  }
  // timed events of the day take their own time first
  const timedIvs = [
    ...pieces.filter((p) => p.source === "calendar" || p.source === "manual").map((p) => [p.start, p.end]),
    ...unmatched.filter((u) => !u.all_day && u.busy !== FREE).map((u) => [u.s, u.e]),
  ];
  const timedU = union(timedIvs);
  const timedMin = timedU.reduce((n, [a, b]) => n + b - a, 0);
  const vacationMin = pieces.filter((p) => p.kind === "vacation").reduce((n, p) => n + p.end - p.start, 0);
  const room = Math.max(0, target - loggedToday - timedMin - vacationMin);
  const timed = [
    ...pieces.filter((p) => p.source === "calendar" || (p.source === "manual" && !String(p.replaces || "").startsWith("ad:"))).map((p) => ({ label: p.label, issue: p.issue, start: fmt(p.start), end: fmt(p.end), minutes: p.end - p.start })),
    ...unmatched.filter((u) => !u.all_day && u.busy !== FREE).map((u) => ({ label: u.subject, issue: null, start: u.start, end: u.end, minutes: u.e - u.s })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  // default split: what is left after the hours you typed, in equal parts (steps of the rounding)
  // edited / posted ones keep what you set (already counted above as your entries); the others share the rest
  const on = list.filter((x) => x.on && !x.edited && !x.posted);
  const flex = on.filter((x) => x.user_minutes === null);
  const left = Math.max(0, room - on.reduce((n, x) => n + (x.user_minutes ?? 0), 0));
  const step = rnd > 1 ? rnd : 1;
  const base = flex.length ? Math.floor(left / flex.length / step) * step : 0;
  let extra = left - base * flex.length;
  for (const x of list) {
    let share = 0;
    if (x.edited || x.posted) { x.default_minutes = x.minutes = x.edited_minutes; continue; }
    if (x.on && x.user_minutes === null) { share = base; if (extra >= step) { share += step; extra -= step; } }
    x.default_minutes = x.on ? share : 0;
    x.minutes = x.on ? (x.user_minutes ?? share) : 0;
  }

  // place them: free working time first (not over timed events), then after it
  const busyTimed = timedU;
  let area = windows.flatMap(([a, b]) => intersect(free, a, b));
  for (const [a, b] of busyTimed) area = subtract(area, a, b);
  let outside = [...free];
  for (const [a, b] of windows) outside = subtract(outside, a, b);
  for (const [a, b] of busyTimed) outside = subtract(outside, a, b);
  const lastEnd = windows.length ? windows[windows.length - 1][1] : 0;
  const slots = [...area.sort((x, y) => x[0] - y[0]), ...outside.filter(([a]) => a >= lastEnd).sort((x, y) => x[0] - y[0]),
    ...outside.filter(([a]) => a < lastEnd).sort((x, y) => y[0] - x[0])];
  const placed = [];
  for (const x of list) {
    x.placed_minutes = 0;
    if (!x.on || x.edited || x.posted || !x.issue || x.minutes <= 0) continue;
    let need = x.minutes;
    while (need > 0 && slots.length) {
      const [a, b] = slots[0];
      const e = Math.min(b, a + need);
      placed.push({ start: a, end: e, issue: x.issue, label: x.subject, kind: "planned", source: "all_day", event_key: x.edit_key });
      x.placed_minutes += e - a;
      need -= e - a;
      if (e >= b) slots.shift(); else slots[0] = [e, b];
    }
  }
  return { list, room, timed, pieces: placed };
}
