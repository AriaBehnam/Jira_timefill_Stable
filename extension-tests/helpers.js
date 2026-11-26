// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

import { DEFAULT_SETTINGS } from "../extension/backend.js";

export const DEFAULTS = { ...DEFAULT_SETTINGS, rounding_minutes: 15, vacation_issue: "LEAVE-1", studio_field: "Project code" };

export function phased(name, keywords, statusMode = "project") {
  const issues = [];
  let n = 220;
  for (const ph of ["INIT", "EXEC", "COMM"])
    for (const r of ["MGMT", "SD"]) issues.push({ key: `PRJ-${++n}`, label: `${ph} · ${r}`, phase: ph, role: r, status_category: "new" });
  return { id: "p-" + name.toLowerCase(), kind: "epic", name, keywords, status_mode: statusMode, issues };
}

// EXEC·MGMT = PRJ-223, EXEC·SD = PRJ-224
export const ALPHA = phased("26.020.P01 Alpha Plant - New Line", ["Alpha"]);

export const ev = (subject, day, s, e, extra = {}) => ({ subject, start: `${day}T${s}`, end: `${day}T${e}`, allDay: false, busy: 2, ...extra });

/** Minimal stand-in for document: querySelectorAll(selector) returns the elements registered for it. */
export function fakeDoc(bySelector) {
  const el = (attrs) => ({ getAttribute: (k) => attrs[k] ?? null, textContent: attrs.text || "", tagName: attrs.tag || "DIV", children: [] });
  return { querySelectorAll: (sel) => (bySelector[sel] || []).map(el) };
}
