// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

import assert from "node:assert/strict";
import { test } from "node:test";

import { classify } from "../extension/planner.js";
import { allIssueOptions, autoStatus, issueTitle, titleFromSummary, titleMap, decorate, effectiveStatus, isInternal, issueFor, labelTokens, phaseLabel, refresh, statusName, workedJql } from "../extension/projects.js";
import { DEFAULTS } from "./helpers.js";

const FIELD = "customfield_10050";
const EPIC_TYPE = { name: "Epic", hierarchyLevel: 1 };
function iss(key, summary, { cat = "indeterminate", type = { name: "Task", hierarchyLevel: 0 }, parent = null, code = null } = {}) {
  const fields = { summary, status: { name: cat === "done" ? "Done" : "In progress", statusCategory: { key: cat } }, issuetype: type };
  if (parent) fields.parent = { key: parent.key, fields: { summary: parent.fields.summary, status: parent.fields.status, issuetype: parent.fields.issuetype } };
  if (code) fields[FIELD] = code;
  return { key, fields };
}
const epic = (key, summary, opts = {}) => iss(key, summary, { type: EPIC_TYPE, ...opts });

// Two PRJ epics of the same study: "Project code" is 26.020 on both, the summary codes differ.
const AM24 = epic("PRJ-200", "26.020.P01 Alpha Plant - New Line", { code: "26.020" });
const AM26 = epic("PRJ-234", "26.020.P02 - Alpha Plant 3", { code: "26.020" });
const kids = (e, name, first, cats = {}) => ["INIT · MGMT", "INIT · SD", "EXEC · MGMT", "EXEC · SD", "COMM · MGMT", "COMM · SD"]
  .map((l, n) => iss(`PRJ-${first + n}`, `${name} · ${l}`, { parent: e, code: "26.020", cat: cats[l] || "new" }));
const KIDS24 = kids(AM24, "26.020.P01 Alpha Plant - New Line", 221, { "INIT · MGMT": "done", "INIT · SD": "done", "EXEC · MGMT": "indeterminate", "EXEC · SD": "indeterminate" });
const KIDS26 = kids(AM26, "26.020.P02 Alpha Plant 3", 241);
// STUDY feasibility epic with one phase
const FOXTROT = epic("STUDY-23", "26.005 - Foxtrot Works");
const FOXTROT_KID = iss("STUDY-25", "26.005 Foxtrot Works · SDF · SD", { parent: FOXTROT, cat: "new" });
// internal project: no code
const GEN = epic("INT-1", "Internal activities");
const GEN_KIDS = [iss("INT-19", "Internal meetings", { parent: GEN }), iss("INT-20", "Formazione", { parent: GEN })];

/** Fake Jira: each search is answered by the first rule whose text appears in the JQL. */
function fakeJira(rules, { fields = [{ id: FIELD, name: "Project code", schema: { type: "string" } }], minutes = {} } = {}) {
  const calls = [];
  return {
    calls,
    myself: async () => ({ accountId: "me", displayName: "Me" }),
    fieldsList: async () => fields,
    search: async (jql) => {
      calls.push(jql);
      for (const [needle, answer] of rules) if (jql.includes(needle)) { if (answer instanceof Error) throw answer; return answer; }
      return [];
    },
    myMinutesPerIssue: async (_a, keys, since) => { calls.push(`minutes since ${since}`); return Object.fromEntries(keys.map((k) => [k, minutes[k] || 0])); },
  };
}
const byName = (data, n) => decorate(data.projects.find((p) => p.name.includes(n)));

test("phase label = summary text after the project name", () => {
  assert.equal(phaseLabel("26.020.P01 Alpha Plant - New Line · INIT · MGMT", "26.020.P01 Alpha Plant - New Line"), "INIT · MGMT");
  assert.equal(phaseLabel("26.005 Foxtrot Works · SDF · SD", "26.005 - Foxtrot Works"), "SDF · SD");
  assert.deepEqual(labelTokens("INIT · MGMT"), { phase: "INIT", role: "MGMT" });
  assert.deepEqual(labelTokens("SDF · SD"), { phase: "SDF", role: "SD" });
});

test("every epic is its own project, even when two epics share the study code", async () => {
  const jira = fakeJira([
    ["assignee = currentUser()", [KIDS24[3], KIDS26[0]]],
    ["parent in (", [...KIDS24, ...KIDS26]],
  ], { minutes: { "PRJ-224": 90 } });
  const data = { projects: [] };
  const added = await refresh(jira, DEFAULTS, data);
  assert.equal(added.length, 2);
  assert.ok(jira.calls.some((q) => q.startsWith("parent in (") && !q.includes("assignee")));
  const a24 = byName(data, "P01"), a26 = byName(data, "P02");
  assert.deepEqual([a24.code, a26.code], ["26.020.P01", "26.020.P02"]); // summary code, not the shared field value
  assert.equal(a26.phases.length, 6); // no duplicates from the other epic
  assert.deepEqual(a24.phases.map((i) => i.label), ["INIT · MGMT", "INIT · SD", "EXEC · MGMT", "EXEC · SD", "COMM · MGMT", "COMM · SD"]);
  assert.deepEqual([a24.status, statusName(a24.status)], ["EXEC", "Project"]);
  assert.deepEqual(a24.allowed_statuses, ["INIT", "EXEC", "COMM", "closed"]);
  assert.deepEqual(a24.phases.filter((i) => i.current).map((i) => i.key), ["PRJ-223", "PRJ-224"]);
  assert.equal(a24.total_minutes, 90);
});

test("a feasibility epic with one SDF phase is 'Feasibility', never 'Active'", async () => {
  const jira = fakeJira([["worklogAuthor", [FOXTROT_KID]], ["parent in (STUDY-23)", [FOXTROT_KID]]]);
  const data = { projects: [] };
  await refresh(jira, DEFAULTS, data);
  const p = decorate(data.projects[0]);
  assert.deepEqual([p.kind, p.code, p.internal, p.status, statusName(p.status)], ["epic", "26.005", false, "SDF", "Feasibility"]);
  assert.deepEqual(p.allowed_statuses, ["SDF", "closed"]);
  assert.deepEqual(p.phases.map((i) => [i.label, i.current]), [["SDF · SD", true]]);
  assert.deepEqual(issueFor(p, "SD"), ["STUDY-25", null]);
  assert.match(issueFor(p, "MGMT")[1], /no SDF · MGMT phase/);
});

test("projects without a code are internal projects; each issue can have its own calendar keywords", async () => {
  const jira = fakeJira([["worklogAuthor", [GEN_KIDS[0]]], ["parent in (INT-1)", GEN_KIDS]]);
  const data = { projects: [] };
  const added = await refresh(jira, DEFAULTS, data);
  assert.deepEqual(added, []); // not announced as a new project
  const g = data.projects[0];
  assert.equal(isInternal(g), true);
  assert.equal(decorate(g).internal, true);
  assert.equal(data.last_report.internal, 1);
  g.issues.find((i) => i.key === "INT-20").keywords = ["training", "formazione"];
  assert.deepEqual(classify({ subject: "Formazione sicurezza", busy: 2 }, data.projects, DEFAULTS), { type: "project", issue: "INT-20", project: "Internal activities", role: null });
  assert.ok(allIssueOptions(data.projects, "LEAVE-1").some((o) => o.key === "INT-19" && o.label === "Internal activities – Internal meetings" && o.internal));
  // keywords survive the next refresh
  await refresh(jira, DEFAULTS, data);
  assert.deepEqual(data.projects[0].issues.find((i) => i.key === "INT-20").keywords, ["training", "formazione"]);
});

test("standalone issues with the same code form one project", async () => {
  const s1 = iss("STUDY-5", "26.011 Golf study · SDF · SD", { code: "26.011" });
  const s2 = iss("STUDY-6", "26.011 Golf study · SDF · MGMT", { code: "26.011" });
  const other = iss("STUDY-9", "26.0119 other · SDF · SD", { code: "26.0119" });
  const jira = fakeJira([["worklogAuthor", [s1]], ["summary ~", [s1, s2, other]]]);
  const data = { projects: [] };
  await refresh(jira, DEFAULTS, data);
  assert.equal(data.projects.length, 1);
  const p = decorate(data.projects[0]);
  assert.deepEqual([p.kind, p.code, p.name, p.status, p.worked_on], ["group", "26.011", "26.011 Golf study", "SDF", true]);
  assert.deepEqual(p.phases.map((i) => i.label), ["SDF · SD", "SDF · MGMT"]);
});

test("closed epic -> Closed; keywords and old statuses carry over to the new model", async () => {
  const closed = epic("PRJ-300", "26.001.P01 Hotel", { cat: "done" });
  const kid = iss("PRJ-301", "26.001.P01 Hotel · EXEC · SD", { parent: closed });
  const jira = fakeJira([["worklogAuthor", [kid]], ["parent in (PRJ-300)", [kid]]]);
  const data = { projects: [{ id: "p-26-001-p01-lyon", kind: "phased", name: "26.001.P01 Hotel", keywords: ["Hotel"], status_mode: "auto",
    issues: [{ key: "PRJ-301", phase: "EXEC", role: "SD", status_category: "indeterminate" }] }] };
  assert.deepEqual(await refresh(jira, DEFAULTS, data), []);
  const p = decorate(data.projects[0]);
  assert.deepEqual([p.status, p.keywords, p.is_new], ["closed", ["Hotel"], false]);
  // a status saved by an older version ("commissioning") still works
  assert.equal(effectiveStatus({ status_mode: "commissioning", issues: [{ key: "A-1", phase: "COMM", role: "SD", status_category: "new" }] }), "COMM");
});

test("refresh reports what it found; a failing worked-on query doesn't stop it", async () => {
  const jira = fakeJira([["worklogAuthor", new Error("Field 'worklogDate' is not allowed")], ["assignee = currentUser()", [FOXTROT_KID]], ["parent in", [FOXTROT_KID]]], { fields: [] });
  const data = { projects: [] };
  await refresh(jira, DEFAULTS, data);
  assert.equal(data.projects.length, 1);
  assert.equal(data.last_report.assigned, 1);
  assert.ok(data.last_report.errors.some((e) => /worked on.*not allowed/.test(e)));
  assert.ok(data.last_report.errors.some((e) => /Project code/.test(e)));
  assert.ok(jira.calls.includes("minutes since 2026-10-01"));
});

test("worked-on query can be switched off", () => {
  assert.equal(workedJql({ ...DEFAULTS, worked_jql: "" }), "");
  assert.equal(workedJql({ worked_jql: "worklogDate >= {track_from}", track_from: "2026-10-01" }), "worklogDate >= 2026-10-01");
});

test("two epics with the same code are one project: the later-phase epic names it, the earlier phases stay", async () => {
  const sdf = epic("STUDY-40", "26.010 - Echo Line 2");
  const sdfKid = iss("STUDY-41", "26.010 Echo Line 2 · SDF · SD", { parent: sdf, cat: "done" });
  const prj = epic("PRJ-90", "26.010 - Echo Line 2");
  const prjKids = ["INIT · MGMT", "INIT · SD", "EXEC · SD"].map((l, n) => iss(`PRJ-${91 + n}`, `26.010 Echo Line 2 · ${l}`, { parent: prj, cat: "new" }));
  const jira = fakeJira([["worklogAuthor", [sdfKid, prjKids[2]]], ["parent in (", [sdfKid, ...prjKids]]], { minutes: { "STUDY-41": 600, "PRJ-93": 120 } });
  const data = { projects: [] };
  const added = await refresh(jira, DEFAULTS, data);
  assert.equal(data.projects.length, 1);
  assert.deepEqual(added, ["26.010 - Echo Line 2"]);
  const p = decorate(data.projects[0]);
  assert.equal(p.epic.key, "PRJ-90");
  assert.deepEqual(p.merged_epics.map((e) => e.key), ["STUDY-40"]);
  assert.deepEqual(p.phases.map((i) => i.label), ["SDF · SD", "INIT · MGMT", "INIT · SD", "EXEC · SD"]);
  assert.equal(p.total_minutes, 720);
  assert.equal(data.last_report.merged, 1);
  // hours in EXEC -> Project, although INIT is not done
  assert.deepEqual([p.status, statusName(p.status)], ["EXEC", "Project"]);
});

test("auto status follows the latest phase where you logged hours", () => {
  const ph = (key, phase, role, cat, mins = 0) => ({ key, phase, role, status_category: cat, my_minutes: mins });
  const proj = (issues) => ({ status_mode: "auto", issues });
  // feasibility in progress, but you logged hours on the project phase -> Project
  assert.equal(autoStatus(proj([ph("A-1", "SDF", "SD", "indeterminate"), ph("A-2", "EXEC", "SD", "new", 60)])), "EXEC");
  // no hours anywhere -> latest phase in progress
  assert.equal(autoStatus(proj([ph("A-1", "SDF", "SD", "indeterminate"), ph("A-2", "EXEC", "SD", "new")])), "SDF");
  // old hours on a finished phase don't hold the project back
  assert.equal(autoStatus(proj([ph("A-1", "INIT", "SD", "done", 300), ph("A-2", "EXEC", "SD", "new")])), "EXEC");
});

test("a project can be switched between External and Internal", () => {
  const ext = { code: "26.005", auto_internal: false, type_mode: "auto", status_mode: "auto", issues: [{ key: "STUDY-25", label: "SDF · SD", phase: "SDF", role: "SD", status_category: "new" }] };
  assert.equal(isInternal(ext), false);
  assert.equal(isInternal({ ...ext, type_mode: "internal" }), true);
  assert.equal(isInternal({ code: "", auto_internal: true, type_mode: "external", issues: [] }), false);
  assert.equal(isInternal({ code: "", general: true, issues: [] }), true); // stored by 1.5.x
});

test("study epic '26.006' + project epic '26.006.P06' are one project, kept under the more complete one", async () => {
  const study = epic("STUDY-77", "26.006 - Echo Line 2");
  const studyKid = iss("STUDY-78", "26.006 Echo Line 2 · SDF · SD", { parent: study, cat: "done" });
  const prj = epic("PRJ-227", "26.006.P06 - Echo Line 2");
  const prjKids = ["INIT · MGMT", "INIT · SD", "EXEC · MGMT", "EXEC · SD"].map((l, n) => iss(`PRJ-${228 + n}`, `26.006.P06 Echo Line 2 · ${l}`, { parent: prj, cat: n < 2 ? "indeterminate" : "new" }));
  const jira = fakeJira([["worklogAuthor", [studyKid, prjKids[0]]], ["parent in (", [studyKid, ...prjKids]]], { minutes: { "STUDY-78": 300 } });
  const data = { projects: [] };
  assert.deepEqual(await refresh(jira, DEFAULTS, data), ["26.006.P06 - Echo Line 2"]);
  assert.equal(data.projects.length, 1);
  const p = decorate(data.projects[0]);
  assert.deepEqual([p.epic.key, p.code, p.merged_epics.map((e) => e.key)], ["PRJ-227", "26.006.P06", ["STUDY-77"]]);
  assert.deepEqual(p.phases.map((i) => i.label), ["SDF · SD", "INIT · MGMT", "INIT · SD", "EXEC · MGMT", "EXEC · SD"]);
  assert.equal(p.total_minutes, 300);
  assert.equal(p.status, "INIT");
});

test("a study epic joins the most complete of several project epics; those stay separate", async () => {
  const study = epic("STUDY-10", "26.020 - Alpha Plant study");
  const studyKid = iss("STUDY-11", "26.020 Alpha Plant study · SDF · SD", { parent: study, cat: "done" });
  const jira = fakeJira([["assignee = currentUser()", [KIDS24[3], KIDS26[0], studyKid]], ["parent in (", [...KIDS24, ...KIDS26, studyKid]]]);
  const data = { projects: [] };
  await refresh(jira, DEFAULTS, data);
  assert.equal(data.projects.length, 2);
  const a24 = byName(data, "P01"), a26 = byName(data, "P02");
  // P24 is further along (EXEC in progress) -> the study joins P24
  assert.deepEqual([a24.merged_epics?.map((e) => e.key), a26.merged_epics], [["STUDY-10"], undefined]);
  assert.equal(a26.phases.length, 6);
});

test("issues are shown as '<project> – <phase>' from the summaries already stored", () => {
  const p = { name: "26.006.P06 - Echo Line 2", epic: { key: "PRJ-227" }, merged_epics: [{ key: "STUDY-77" }],
    issues: [{ key: "PRJ-229", label: "EXEC · SD" }, { key: "STUDY-78", label: "SDF · SD" }] };
  assert.equal(issueTitle(p, p.issues[0]), "26.006.P06 - Echo Line 2 – EXEC · SD");
  assert.deepEqual(titleMap([p]), { "PRJ-227": "26.006.P06 - Echo Line 2", "STUDY-77": "26.006.P06 - Echo Line 2",
    "PRJ-229": "26.006.P06 - Echo Line 2 – EXEC · SD", "STUDY-78": "26.006.P06 - Echo Line 2 – SDF · SD" });
  assert.equal(titleFromSummary("26.008.P08 Example · COMM · SD"), "26.008.P08 Example – COMM · SD");
  assert.equal(titleFromSummary("VACANZA - Task interno"), "VACANZA - Task interno");
});
