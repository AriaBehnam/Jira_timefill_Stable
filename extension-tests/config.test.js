// Timefill — Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { defaultRoleOf, phasesOf, rolesOf } from "../extension/config.js";
import { buildDay, workWindows } from "../extension/planner.js";
import { configure, effectiveStatus, issueFor, labelTokens, statusName } from "../extension/projects.js";
import { DEFAULTS } from "./helpers.js";

after(() => configure(DEFAULTS)); // back to the default phases for the other test files

// a team that writes "OFFER / BUILD / SITE" phases and "PM / ENG" roles in Jira, and English-only title words
const CUSTOM = {
  ...DEFAULTS,
  phases: [
    { token: "offer", name: "Offer", words: "offer, quote", type: "presale" },
    { token: "BUILD", name: "Build", words: "build", type: "project" },
    { token: "SITE", name: "On site", words: "site, install", type: "install" },
  ],
  roles: [{ token: "PM", name: "Project management", words: "pm" }, { token: "ENG", name: "Engineering", words: "eng, dev" }],
  default_role: "ENG",
};

test("phases and roles come from Settings: Jira names, shown names, title words, lifecycle order", () => {
  configure(CUSTOM);
  assert.deepEqual(phasesOf(CUSTOM).map((p) => p.token), ["OFFER", "BUILD", "SITE"]); // upper-cased, order kept
  assert.deepEqual(labelTokens("BUILD · PM"), { phase: "BUILD", role: "PM" });
  assert.equal(statusName("SITE"), "On site");
  const JOB = { id: "j", kind: "epic", name: "Job", keywords: ["job"], status_mode: "auto", auto_internal: false, issues: [
    { key: "J-1", phase: "OFFER", role: "PM", status_category: "done" }, { key: "J-2", phase: "BUILD", role: "PM", status_category: "indeterminate" },
    { key: "J-3", phase: "BUILD", role: "ENG", status_category: "indeterminate" }, { key: "J-4", phase: "SITE", role: "ENG", status_category: "new" }] };
  assert.equal(effectiveStatus(JOB), "BUILD");
  assert.deepEqual(issueFor(JOB, "PM"), ["J-2", null]);
  const day = (title) => buildDay("2026-11-09", [{ subject: title, start: "2026-11-09T09:00", end: "2026-11-09T10:00", allDay: false, busy: 2 }], [], [JOB], CUSTOM, [], new Date(2026, 11, 1)).entries[0]?.issue;
  assert.equal(day("Job pm sync"), "J-2");           // role word
  assert.equal(day("Job review"), "J-3");            // no role word -> default role ENG
  assert.equal(day("Job dev install check"), "J-4"); // phase word -> SITE
});

test("settings saved before phases/roles were editable keep their title words", () => {
  const old = { role_tokens_sd: "E, SD, tech", role_tokens_mgmt: "M", phase_words_comm: "COMM, montaggio" };
  assert.equal(rolesOf(old).find((r) => r.token === "SD").words, "E, SD, tech");
  assert.equal(phasesOf(old).find((p) => p.token === "COMM").words, "COMM, montaggio");
  assert.equal(defaultRoleOf({ ...old, default_role: "MGMT" }), "MGMT");
});

test("lunch: same start and end = no lunch break", () => {
  assert.deepEqual(workWindows("2026-11-09", { ...DEFAULTS, lunch_start: "12:00", lunch_end: "12:00" }), [[480, 720], [720, 960]]); // 08:00-16:00
});
