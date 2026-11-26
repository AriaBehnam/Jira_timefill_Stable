// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
//
// Phases and roles, as configured in Settings → Phases & roles.
//
//   phase: { token, name, words, type }
//     token  how the phase is written in your Jira issue summaries, e.g. "EXEC" in "Big Job · EXEC · SD"
//     name   what Timefill shows for a project in that phase, e.g. "Project"
//     words  words in a calendar event title that choose this phase, e.g. "installation"
//     type   which "type of work" it counts as on the Charts page: presale | project | install | internal | training | general
//   The order of the list is the lifecycle order (a project moves from the first phase to the last).
//
//   role: { token, name, words }
//     token  how the role is written in your Jira issue summaries, e.g. "SD"
//     name   what Timefill shows, e.g. "Engineering"
//     words  stand-alone words in an event title that choose this role, e.g. "E"

export const WORK_TYPES = ["presale", "project", "install", "internal", "training", "general"];
// An internal issue can also count as vacation / absence (e.g. leave for a medical visit).
export const INTERNAL_TYPES = [...WORK_TYPES, "vacation"];

export const DEFAULT_PHASES = [
  { token: "SDF", name: "Feasibility", words: "SDF, feasibility, fattibilità, fattibilita", type: "presale" },
  { token: "INIT", name: "Pre-sale", words: "INIT, pre-sale, presale, prevendita", type: "presale" },
  { token: "EXEC", name: "Project", words: "EXEC, project, progetto", type: "project" },
  { token: "COMM", name: "Commissioning", words: "COMM, commissioning, installation, installazione, collaudo, avviamento", type: "install" },
];

export const DEFAULT_ROLES = [
  { token: "MGMT", name: "Management", words: "M, MGMT" },
  { token: "SD", name: "Engineering", words: "E, SD" },
];

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const tokenOf = (v) => clean(v).toUpperCase().replace(/[^A-Z0-9_-]/g, "");

// Settings saved before phases/roles were configurable kept only the title words, under these keys.
const LEGACY_PHASE_WORDS = { SDF: "phase_words_sdf", INIT: "phase_words_init", EXEC: "phase_words_exec", COMM: "phase_words_comm" };
const LEGACY_ROLE_WORDS = { MGMT: "role_tokens_mgmt", SD: "role_tokens_sd" };

/** The phases in lifecycle order (from Settings, or the defaults + any title words saved by older versions). */
export function phasesOf(s = {}) {
  const list = Array.isArray(s.phases) ? s.phases
    : DEFAULT_PHASES.map((p) => ({ ...p, words: s[LEGACY_PHASE_WORDS[p.token]] ?? p.words }));
  const seen = new Set();
  return list.map((p) => ({ token: tokenOf(p.token), name: clean(p.name) || tokenOf(p.token), words: clean(p.words),
    type: WORK_TYPES.includes(p.type) ? p.type : "project" }))
    .filter((p) => p.token && !seen.has(p.token) && seen.add(p.token));
}

/** The roles (from Settings, or the defaults + any title words saved by older versions). */
export function rolesOf(s = {}) {
  const list = Array.isArray(s.roles) ? s.roles
    : DEFAULT_ROLES.map((r) => ({ ...r, words: s[LEGACY_ROLE_WORDS[r.token]] ?? r.words }));
  const seen = new Set();
  return list.map((r) => ({ token: tokenOf(r.token), name: clean(r.name) || tokenOf(r.token), words: clean(r.words) }))
    .filter((r) => r.token && !seen.has(r.token) && seen.add(r.token));
}

/** The role used when an event title has none of the role words. */
export function defaultRoleOf(s = {}) {
  const roles = rolesOf(s);
  const want = tokenOf(s.default_role);
  return roles.find((r) => r.token === want)?.token || roles[roles.length - 1]?.token || "";
}
