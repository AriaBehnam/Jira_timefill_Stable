// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { ALPHA, DEFAULTS } from "./helpers.js";

// --- fake Chrome APIs ---------------------------------------------------------
let store;
globalThis.chrome = {
  storage: { local: {
    get: async (k) => ({ [k]: structuredClone(store[k]) }),
    set: async (o) => { Object.assign(store, structuredClone(o)); },
  } },
  tabs: { query: async () => [], sendMessage: async () => null, create: async () => ({}) },
  scripting: { executeScript: async () => [] },
};

// --- fake Jira -------------------------------------------------------------------
let posted, updated, worklogAuthor;
const COMMENT = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "layout review" }] }] };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const json = (o, status = 200) => ({ status, text: async () => JSON.stringify(o) });
  if (u.pathname === "/rest/api/3/myself") return json({ accountId: "me", displayName: "Test User" });
  if (u.pathname === "/rest/api/3/search/jql") return json({ issues: [], isLast: true });
  const one = /^\/rest\/api\/3\/issue\/([^/]+)\/worklog\/([^/]+)$/.exec(u.pathname);
  if (one && (init.method || "GET") === "GET") return json({ id: one[2], author: { accountId: worklogAuthor }, comment: COMMENT });
  if (one && init.method === "PUT") {
    updated.push({ issue: one[1], id: one[2], notify: u.searchParams.get("notifyUsers"), ...JSON.parse(init.body) });
    return json({ id: one[2] });
  }
  const m = /^\/rest\/api\/3\/issue\/([^/]+)\/worklog$/.exec(u.pathname);
  if (m && init.method === "POST") {
    assert.equal(init.credentials, "include"); // browser login by default
    posted.push({ issue: m[1], ...JSON.parse(init.body) });
    return json({ id: "1" }, 201);
  }
  return json({ errorMessages: ["not mocked: " + u.pathname] }, 404);
};

const { handle, clearJiraCopy } = await import("../extension/backend.js");

beforeEach(() => {
  clearJiraCopy(); // each test starts without worklogs read by an earlier test
  posted = [];
  updated = [];
  worklogAuthor = "me";
  store = {
    settings: { jira_url: "https://acme.atlassian.net", vacation_issue: "LEAVE-1", studio_field: "Project code" },
    projects: { projects: [ALPHA], last_refresh: null },
    overrides: [],
    calendar_cache: {
      "2026-11-09": { read_at: "2026-11-09T18:00", events: [
        { subject: "Alpha E layout review", start: "2026-11-09T08:00", end: "2026-11-09T11:30", allDay: false, busy: 2 },
        { subject: "alpha m weekly", start: "2026-11-09T13:30", end: "2026-11-09T17:00", allDay: false, busy: 2 },
      ] },
    },
  };
});

const plan = () => handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13");

test("plan uses the cached Outlook week and flags unread days", async () => {
  const p = await plan();
  const mon = p.days[0];
  assert.deepEqual(mon.entries.map((e) => e.issue), ["PRJ-224", "PRJ-223"]);
  assert.equal(mon.calendar_read, true);
  assert.equal(p.days[1].calendar_read, false);
  assert.ok(p.warnings.some((w) => w.includes("2026-11-10")));
  assert.equal(p.jira_ok, true);
});

test("nothing is posted without approval", async () => {
  await assert.rejects(handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [] }), /nothing approved/);
  assert.equal(posted.length, 0);
});

test("only the approved worklog is posted, with local time offset", async () => {
  const p = await plan();
  const [first] = p.days[0].entries;
  const r = await handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [first.id, "stale|id"] });
  assert.deepEqual(r.done, [{ id: first.id }]);
  assert.deepEqual(r.skipped.map((s) => s.id), ["stale|id"]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].issue, "PRJ-224");
  assert.equal(posted[0].timeSpentSeconds, 3.5 * 3600);
  assert.match(posted[0].started, /^2026-11-09T08:00:00\.000[+-]\d{4}$/);
  assert.equal(posted[0].comment.content[0].content[0].text, "Alpha E layout review");
});

test("Jira URL outside atlassian.net is refused", async () => {
  store.settings.jira_url = "https://evil.example.com";
  await assert.rejects(handle("POST", "/api/test/jira"), /atlassian\.net/);
});

test("manual assignment round-trip", async () => {
  const o = await handle("POST", "/api/overrides", { date: "2026-11-10", start: "08:00", end: "12:30", issue: "INT-19 — General" });
  assert.equal(o.issue, "INT-19");
  const p = await plan();
  assert.equal(p.days[1].entries[0].issue, "INT-19");
  await handle("DELETE", `/api/overrides/${o.id}`);
  assert.equal(store.overrides.length, 0);
});

test("moving a worklog on the calendar updates it in Jira and keeps its comment", async () => {
  const r = await handle("PUT", "/api/worklogs/PRJ-224/10042", { date: "2026-11-10", start: "09:30", minutes: 150 });
  assert.deepEqual(r, { ok: true });
  assert.equal(updated.length, 1);
  const u = updated[0];
  assert.equal(u.issue, "PRJ-224");
  assert.equal(u.id, "10042");
  assert.equal(u.notify, "false");
  assert.equal(u.timeSpentSeconds, 150 * 60);
  assert.match(u.started, /^2026-11-10T09:30:00\.000[+-]\d{4}$/);
  assert.deepEqual(u.comment, COMMENT);
});

test("only your own worklogs can be moved, and only to a valid time", async () => {
  worklogAuthor = "someone-else";
  await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/1", { date: "2026-11-10", start: "09:00", minutes: 60 }), /your own worklogs/);
  worklogAuthor = "me";
  await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/1", { date: "2026-11-10", start: "23:30", minutes: 60 }), /midnight/);
  await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/1", { date: "2026-11-10", start: "09:00", minutes: 0 }), /at least 1 minute/);
  await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/1", { start: "09:00", minutes: 60 }), /date is required/);
  assert.equal(updated.length, 0);
});

test("editing a 'to fill' block: replace, change, don't fill, undo; posting keeps the event replaced", async () => {
  const before = await plan();
  const seg = before.days[0].segments.find((x) => x.kind === "planned" && x.issue === "PRJ-224");
  assert.ok(seg.event_key);
  // drag it to 13:30-15:00 (overlaps the M meeting: your change wins) and switch to MGMT
  const [o] = await handle("POST", "/api/overrides/replace", { replaces: seg.event_key, items: [{ date: "2026-11-09", start: "13:30", end: "15:00", issue: "PRJ-223", label: "Alpha E layout review" }] });
  let p = await plan();
  assert.deepEqual(p.days[0].entries.map((e) => [e.issue, e.start_hm, e.end_hm]), [["PRJ-223", "13:30", "17:00"]]);
  // resize it
  await handle("PATCH", `/api/overrides/${o.id}`, { end: "14:30" });
  assert.equal(store.overrides[0].end, "14:30");
  await assert.rejects(handle("PATCH", `/api/overrides/${o.id}`, { end: "13:00" }), /end must be after start/);
  // don't fill
  await handle("POST", "/api/overrides/skip", { replaces: seg.event_key, date: "2026-11-09", label: "x" });
  assert.deepEqual(store.overrides.map((x) => !!x.skip), [true]);
  p = await plan();
  assert.equal(p.days[0].dismissed.length, 1);
  // undo -> the calendar proposal is back
  await handle("DELETE", `/api/overrides/${store.overrides[0].id}`);
  assert.deepEqual((await plan()).days[0].entries.map((e) => e.issue), ["PRJ-224", "PRJ-223"]);
  // change + post: the change becomes a marker, the original 08:00 event does not come back
  await handle("POST", "/api/overrides/replace", { replaces: seg.event_key, items: [{ date: "2026-11-09", start: "08:30", end: "11:30", issue: "PRJ-224" }] });
  p = await plan();
  const e = p.days[0].entries.find((x) => x.start_hm === "08:30");
  await handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [e.id] });
  assert.equal(posted.at(-1).timeSpentSeconds, 3 * 3600);
  assert.deepEqual(store.overrides.map((x) => [x.skip, x.posted, x.replaces]), [[true, true, seg.event_key]]);
});

test("the plan carries '<project> – <phase>' titles, also for worklogs outside your projects, with no extra calls", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(new URL(url).pathname);
    const u = new URL(url);
    const json = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (u.pathname === "/rest/api/3/search/jql") return json({ issues: [{ key: "OTH-5", fields: { summary: "26.012.P01 Other job · EXEC · SD" } }], isLast: true });
    if (u.pathname === "/rest/api/3/issue/OTH-5/worklog") return json({ worklogs: [{ id: "9", author: { accountId: "me" }, started: "2026-11-10T09:00:00.000+0100", timeSpentSeconds: 3600 }], total: 1 });
    return realFetch(url, init);
  };
  try {
    store.projects.account_id = "me";
    const p = await plan();
    assert.equal(p.titles["PRJ-224"], `${ALPHA.name} – EXEC · SD`);
    assert.equal(p.titles["OTH-5"], "26.012.P01 Other job – EXEC · SD");
    assert.equal(store.issue_titles["OTH-5"], "26.012.P01 Other job – EXEC · SD"); // cached
    assert.ok(!calls.some((c) => /\/issue\/[^/]+$/.test(c))); // no per-issue lookups
  } finally { globalThis.fetch = realFetch; }
  const { issueKeyOf } = await import("../extension/backend.js");
  assert.equal(issueKeyOf("26.006.P06 - Echo Line 2 – EXEC · SD · PRJ-229"), "PRJ-229");
  assert.equal(issueKeyOf("PRJ-224 — Alpha"), "PRJ-224");
});

test("assign box: project list, and the phase is detected for the event", async () => {
  // event with "M" -> the project is matched by keyword and the MGMT phase of the current status is preselected
  let r = await handle("GET", `/api/pick?label=${encodeURIComponent("Alpha M weekly")}`);
  assert.equal(r.selected, ALPHA.id);
  assert.equal(r.projects.find((x) => x.id === ALPHA.id).suggested, "PRJ-223");
  // an "E" event -> SD phase
  r = await handle("GET", `/api/pick?label=${encodeURIComponent("Alpha E layout")}`);
  assert.equal(r.projects.find((x) => x.id === ALPHA.id).suggested, "PRJ-224");
  // missing time (no title): nothing preselected, each project still suggests its current phase (default role)
  r = await handle("GET", "/api/pick?label=");
  assert.equal(r.selected, null);
  assert.equal(r.projects.find((x) => x.id === ALPHA.id).suggested, "PRJ-224");
  assert.deepEqual(r.projects.find((x) => x.id === ALPHA.id).phases.map((i) => i.label).slice(0, 2), ["INIT · MGMT", "INIT · SD"]);
  // editing an existing entry: its own phase is selected
  r = await handle("GET", "/api/pick?label=x&current=PRJ-221");
  assert.deepEqual([r.selected, r.projects.find((x) => x.id === ALPHA.id).suggested], [ALPHA.id, "PRJ-221"]);
  assert.ok(r.projects.some((x) => x.id === "vacation"));
});

test("find any project in Jira by name and add it to my list; remove it again", async () => {
  const realFetch = globalThis.fetch;
  const epic = { key: "PRJ-500", fields: { summary: "26.011.P01 - Golf Alba", status: { name: "Done", statusCategory: { key: "done" } }, issuetype: { name: "Epic", hierarchyLevel: 1 } } };
  const kid = { key: "PRJ-501", fields: { summary: "26.011.P01 Golf Alba · EXEC · SD", status: { name: "Open", statusCategory: { key: "new" } }, issuetype: { name: "Task", hierarchyLevel: 0 },
    parent: { key: "PRJ-500", fields: { summary: epic.fields.summary, status: epic.fields.status, issuetype: epic.fields.issuetype } } } };
  const jqls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (u.pathname === "/rest/api/3/search/jql") {
      const { jql } = JSON.parse(init.body);
      jqls.push(jql);
      if (jql === "issuekey = PRJ-501") return json({ issues: [kid], isLast: true });
      if (jql.startsWith("summary ~")) return json({ issues: jql.includes("golf") ? [kid] : [], isLast: true });
      if (jql.includes("PRJ-500")) return json({ issues: jql.startsWith("parent") ? [kid] : [epic], isLast: true });
      return json({ issues: [], isLast: true });
    }
    if (u.pathname === "/rest/api/3/field") return json([]);
    if (/\/worklog$/.test(u.pathname)) return json({ worklogs: [], total: 0 });
    return realFetch(url, init);
  };
  try {
    const found = await handle("GET", "/api/jira/find?q=golf");
    assert.ok(jqls.some((q) => q.startsWith('summary ~ "golf*"') && !q.includes("assignee") && !q.includes("status")));
    assert.deepEqual(found.map((f) => [f.key, f.kind, f.name, f.in_list]), [["PRJ-500", "epic", "26.011.P01 - Golf Alba", false]]);
    // searching an issue key finds it directly (here a phase of the project -> its project)
    const byKey = await handle("GET", "/api/jira/find?q=prj-501");
    assert.ok(jqls.includes("issuekey = PRJ-501"));
    assert.deepEqual(byKey.map((f) => [f.key, f.kind]), [["PRJ-500", "epic"]]);
    const r = await handle("POST", "/api/projects/pin", { key: "PRJ-500" });
    assert.deepEqual(r.added, ["26.011.P01 - Golf Alba"]);
    const p = store.projects.projects.find((x) => x.epic?.key === "PRJ-500");
    assert.equal(p.pinned, true);
    assert.deepEqual(store.projects.pinned, ["PRJ-500"]);
    assert.equal((await handle("GET", "/api/jira/find?q=golf"))[0].in_list, true);
    // it survives the next refresh although it's not assigned to me
    await handle("POST", "/api/projects/refresh");
    assert.ok(store.projects.projects.some((x) => x.epic?.key === "PRJ-500"));
    // remove
    assert.deepEqual(await handle("DELETE", `/api/projects/${p.id}/pin`), { ok: true, removed: true });
    assert.ok(!store.projects.projects.some((x) => x.epic?.key === "PRJ-500"));
  } finally { globalThis.fetch = realFetch; }
});

test("a worklog already in Jira can be moved to another project/phase (copy there, then delete the old one)", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  let failDelete = false;
  const comment = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "site visit" }] }] };
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || "GET";
    calls.push(`${method} ${u.pathname}`);
    const json = (o, status = 200) => ({ status, text: async () => JSON.stringify(o) });
    if (method === "GET" && u.pathname === "/rest/api/3/issue/PRJ-224/worklog/77") return json({ id: "77", author: { accountId: "me" }, comment });
    if (method === "POST" && u.pathname === "/rest/api/3/issue/PRJ-223/worklog") { calls.push(init.body); return json({ id: "88" }, 201); }
    if (method === "DELETE" && u.pathname === "/rest/api/3/issue/PRJ-224/worklog/77") return failDelete ? json({ errorMessages: ["nope"] }, 403) : json(null, 204);
    return realFetch(url, init);
  };
  try {
    store.projects.account_id = "me";
    const r = await handle("PUT", "/api/worklogs/PRJ-224/77", { date: "2026-11-10", start: "09:00", minutes: 90, issue: "PRJ-223" });
    assert.deepEqual(r, { ok: true, issue: "PRJ-223", id: "88" });
    const body = JSON.parse(calls.find((c) => c.startsWith("{")));
    assert.equal(body.timeSpentSeconds, 5400);
    assert.deepEqual(body.comment, comment); // comment kept
    assert.ok(calls.indexOf("POST /rest/api/3/issue/PRJ-223/worklog") < calls.indexOf("DELETE /rest/api/3/issue/PRJ-224/worklog/77")); // copy first
    failDelete = true;
    await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/77", { date: "2026-11-10", start: "09:00", minutes: 90, issue: "PRJ-223" }), /could not be deleted.*counts twice/);
  } finally { globalThis.fetch = realFetch; }
});

test("Outlook connections: Chrome's close reason is handled; suspended page disconnects and reconnects", async () => {
  const { watchOutlookTabs } = await import("../extension/backend.js");
  const ports = [], pageListeners = {};
  let lastErrorReads = 0;
  const saved = { tabs: chrome.tabs, runtime: chrome.runtime, add: globalThis.addEventListener };
  chrome.tabs = { ...saved.tabs,
    query: async () => [{ id: 7, url: "https://outlook.office.com/calendar/view/week" }],
    connect: () => { const p = { closed: false, listeners: [], onDisconnect: { addListener: (f) => p.listeners.push(f) }, disconnect() { p.closed = true; } }; ports.push(p); return p; },
    onUpdated: { addListener() {} }, onRemoved: { addListener() {} } };
  chrome.runtime = { get lastError() { lastErrorReads++; return { message: "The page keeping the extension port is moved into back/forward cache" }; } };
  globalThis.addEventListener = (t, f) => { pageListeners[t] = f; };
  try {
    await watchOutlookTabs();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ports.length, 1);
    ports[0].listeners.forEach((f) => f()); // Chrome closes the port
    assert.equal(lastErrorReads, 1);          // reason read -> no "Unchecked runtime.lastError"
    await new Promise((r) => setTimeout(r, 10));
    pageListeners.pageshow({ persisted: true }); // page restored from the back/forward cache
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ports.length, 2);
    pageListeners.pagehide();                  // page suspended again: we close the connection ourselves
    assert.equal(ports[1].closed, true);
  } finally { chrome.tabs = saved.tabs; chrome.runtime = saved.runtime; globalThis.addEventListener = saved.add; }
});

test("security: credentials only ever go to https://<name>.atlassian.net", async () => {
  const { jiraOrigin, JiraClient } = await import("../extension/jira.js");
  for (const bad of ["https://evil.com?.atlassian.net", "https://evil.com#.atlassian.net", "https://evil.com/.atlassian.net",
    "http://acme.atlassian.net", "https://user:pw@acme.atlassian.net", "https://acme.atlassian.net:8443", "https://acme.atlassian.net.evil.com",
    "https://acme.atlassian.net/jira?x=1", "javascript:alert(1)//acme.atlassian.net", ""])
    assert.throws(() => jiraOrigin(bad), /atlassian\.net/, bad);
  assert.equal(jiraOrigin(" https://acme.atlassian.net/ "), "https://acme.atlassian.net");
  assert.throws(() => new JiraClient({ jira_url: "https://evil.com?.atlassian.net", jira_auth: "token", jira_email: "a@b.c", jira_token: "t" }), /atlassian\.net/);
  // saving a bad URL is refused; a good one is stored as the bare origin
  await assert.rejects(handle("POST", "/api/settings", { jira_url: "https://evil.com#.atlassian.net" }), /atlassian\.net/);
  assert.equal((await handle("POST", "/api/settings", { jira_url: "https://acme.atlassian.net/" })).jira_url, "https://acme.atlassian.net");
  // "Open week in Outlook" may only open Outlook
  await assert.rejects(handle("POST", "/api/settings", { outlook_week_url: "https://evil.example/{yyyy}/{m}/{d}" }), /Outlook web/);
});

test("security: switching Jira site or login forgets the cached account id", async () => {
  store.projects.account_id = "someone-else";
  await handle("POST", "/api/settings", { jira_url: "https://acme.atlassian.net" }); // unchanged -> kept
  assert.equal(store.projects.account_id, "someone-else");
  await handle("POST", "/api/settings", { jira_url: "https://other.atlassian.net" });
  assert.equal(store.projects.account_id, undefined);
});

test("security: moving a worklog checks ownership against who is signed in now, not a cached id", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const json = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (u.pathname === "/rest/api/3/myself") return json({ accountId: "new-login" });
    if (u.pathname.endsWith("/worklog/77")) return json({ id: "77", author: { accountId: "old-login" } });
    throw new Error("must not write: " + (init.method || "GET") + " " + u.pathname);
  };
  try {
    store.projects.account_id = "old-login"; // stale cache
    await assert.rejects(handle("PUT", "/api/worklogs/PRJ-224/77", { date: "2026-11-10", start: "09:00", minutes: 60, issue: "PRJ-223" }), /only change your own/);
  } finally { globalThis.fetch = realFetch; }
});

test("security: an approval covers the comment; if the calendar title changes after review, nothing is posted", async () => {
  const p = await plan();
  const first = p.days[0].entries[0];
  store.calendar_cache["2026-11-09"].events[0].subject = "Alpha E layout review (renamed)";
  const r = await handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [first.id] });
  assert.deepEqual([r.done.length, r.skipped.map((x) => x.id)], [0, [first.id]]);
  assert.equal(posted.length, 0);
});

test("speed: Jira is read when the page opens or on Refresh; local changes redraw from the copy (no network)", async () => {
  const realFetch = globalThis.fetch;
  let jiraCalls = 0;
  globalThis.fetch = async (url, init) => { jiraCalls++; return realFetch(url, init); };
  let tabReads = 0;
  const realQuery = chrome.tabs.query;
  chrome.tabs.query = async () => { tabReads++; return []; };
  try {
    await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13&fresh=1");   // opening the Status page
    const afterOpen = jiraCalls;
    assert.ok(afterOpen > 0);
    // assign, drag, undo: no Jira calls
    const o = await handle("POST", "/api/overrides", { date: "2026-11-10", start: "08:00", end: "09:00", issue: "INT-19" });
    const p1 = await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13");
    assert.equal(p1.days[1].entries[0].issue, "INT-19");
    await handle("PATCH", `/api/overrides/${o.id}`, { end: "10:00" });
    const p2 = await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13");
    assert.equal(p2.days[1].entries[0].minutes, 120);
    assert.equal(jiraCalls, afterOpen);
    assert.equal(p2.read_now, false);
    // another week not read yet: read once
    await handle("GET", "/api/plan?from=2026-11-16&to=2026-11-20");
    assert.ok(jiraCalls > afterOpen);
    // Refresh: read again
    const before = jiraCalls;
    await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13&fresh=1");
    assert.ok(jiraCalls > before);
  } finally { globalThis.fetch = realFetch; chrome.tabs.query = realQuery; }
});

test("speed: after posting, the copy already contains the new worklog (no re-download, nothing proposed twice)", async () => {
  const p = await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13&fresh=1");
  const first = p.days[0].entries[0];
  await handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [first.id] });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("no Jira call expected"); };
  try {
    const after = await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13");
    assert.ok(after.days[0].segments.some((x) => x.kind === "logged" && x.issue === first.issue && x.start === 480));
    assert.ok(!after.days[0].entries.some((e) => e.id === first.id)); // not proposed again
  } finally { globalThis.fetch = realFetch; }
});

test("existing worklogs: worklogAuthor JQL over all projects, then only my worklogs inside the range", async () => {
  const { JiraClient } = await import("../extension/jira.js");
  const calls = [];
  const fake = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.pathname + (init.body ? " " + init.body : ""));
    const json = (o) => ({ status: 200, text: async () => JSON.stringify(o) });
    if (u.pathname.endsWith("/search/jql")) return json({ issues: [
      { key: "INT-19", fields: { summary: "Internal meetings" } }, { key: "LEAVE-1", fields: { summary: "VACANZA" } }, { key: "PRJ-224", fields: { summary: "x" } }], isLast: true });
    const m = /issue\/([^/]+)\/worklog$/.exec(u.pathname);
    const all = {
      "INT-19": [{ id: "a", author: { accountId: "me" }, started: "2026-11-10T09:00:00.000+0100", timeSpentSeconds: 3600 }],
      "LEAVE-1": [{ id: "b", author: { accountId: "me" }, started: "2026-11-11T08:00:00.000+0100", timeSpentSeconds: 28800 }],
      "PRJ-224": [{ id: "c", author: { accountId: "someone" }, started: "2026-11-10T10:00:00.000+0100", timeSpentSeconds: 3600 },
        { id: "d", author: { accountId: "me" }, started: "2026-11-20T10:00:00.000+0100", timeSpentSeconds: 3600 }], // outside the range
    };
    return json({ worklogs: all[m[1]] || [], total: (all[m[1]] || []).length });
  };
  const j = new JiraClient({ jira_url: "https://acme.atlassian.net" }, fake);
  const got = await j.myWorklogsBetween("me", "2026-11-09", "2026-11-13");
  const jql = JSON.parse(calls[0].slice(calls[0].indexOf(" ") + 1)).jql;
  assert.match(jql, /^worklogAuthor = currentUser\(\) AND worklogDate >= "2026-11-08" AND worklogDate <= "2026-11-14"$/);
  assert.ok(!/project/i.test(jql)); // all projects
  assert.deepEqual(got.map((w) => [w.issue, w.id, w.start]), [["INT-19", "a", "2026-11-10T09:00"], ["LEAVE-1", "b", "2026-11-11T08:00"]]);
});

test("settings: phases & roles are checked when saved", async () => {
  await assert.rejects(handle("POST", "/api/settings", { phases: [] }), /at least one phase/);
  await assert.rejects(handle("POST", "/api/settings", { roles: [{ token: "", name: "x" }] }), /at least one role/);
  await assert.rejects(handle("POST", "/api/settings", { lunch_start: "13:00", lunch_end: "12:00" }), /Lunch must end/);
  const s = await handle("POST", "/api/settings", { phases: [{ token: "build", name: "Build", words: "build", type: "project" }],
    roles: [{ token: "eng", name: "Engineering", words: "eng" }], default_role: "nothing" });
  assert.deepEqual([s.phases[0].token, s.roles[0].token, s.default_role], ["BUILD", "ENG", "ENG"]);
  assert.equal((await handle("GET", "/api/projects")).phase_names.BUILD, "Build");
  await handle("POST", "/api/settings", { phases: DEFAULTS.phases, roles: DEFAULTS.roles, default_role: "SD" }); // restore for other tests
});

test("trace: 'Delta demo' all-day Busy Wed 4 -> Fri 6 Nov is matched and fills 3 days (counts per stage)", async () => {
  const quiet = { info: console.info, log: console.log, table: console.table, group: console.groupCollapsed, end: console.groupEnd };
  console.info = console.log = console.table = console.groupCollapsed = console.groupEnd = () => {};
  try {
    store.projects = { projects: [{ ...ALPHA, keywords: ["alpha", "delta"] }], last_refresh: null };
    const demo = { subject: "Delta demo", start: "2026-11-04T00:00", end: "2026-11-07T00:00", allDay: true, busy: 2 };
    const declined = { subject: "Declined: Alpha sync", start: "2026-11-03T10:00", end: "2026-11-03T11:00", allDay: false, busy: 2 };
    const reminder = { subject: "Showroom reminder", start: "2026-11-02T00:00", end: "2026-11-07T00:00", allDay: true, busy: 0 };
    for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"])
      store.calendar_cache[d] = { read_at: "2026-11-09T08:00", events: [demo, declined, reminder].filter((e) => e.start < `${d}T23:59` && e.end > `${d}T00:00`) };
    const p = await handle("GET", "/api/plan?from=2026-11-02&to=2026-11-06");
    const t = p.trace;
    assert.equal(t.counts["b) events in range (all-day)"], "3 (2)");
    assert.match(t.counts["c) after declined/cancelled/Free filter"], /^1 \(removed 1 declined\/cancelled, 1 Free all-day/);
    assert.match(t.counts["d) keyword match"], /^1 project/);
    const row = t.all_day.find((r) => r.subject === "Delta demo");
    assert.deepEqual([row.result, row.from, row.to_incl, row.busy], ["project", "2026-11-04", "2026-11-06", "busy"]);
    assert.equal(row.project, ALPHA.name);
    assert.deepEqual(t.fill.map((d) => d.all_day_fill_h), [0, 0, 8, 8, 7]); // 3 days x the full working day
  } finally { Object.assign(console, { info: quiet.info, log: quiet.log, table: quiet.table, groupCollapsed: quiet.group, groupEnd: quiet.end }); }
});

test("a week Outlook isn't showing: the open Outlook tab is moved to it and read; not while you are busy; never a new tab", async () => {
  const quiet = { info: console.info, log: console.log, table: console.table, group: console.groupCollapsed, end: console.groupEnd };
  console.info = console.log = console.table = console.groupCollapsed = console.groupEnd = () => {};
  const saved = chrome.tabs;
  let shown = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"], busy = false, created = 0;
  const moves = [];
  chrome.tabs = {
    query: async () => [{ id: 7, url: "https://outlook.office.com/calendar/view/workweek" }],
    create: async () => { created++; return { id: 8 }; },
    update: async (id, o) => { moves.push([id, o.url]); shown = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]; },
    sendMessage: async (_id, msg) => msg.type === "timefill-busy" ? { busy, onCalendar: true }
      : { ok: true, count: 4, visibleDates: shown, method: "headers", url: "x", stats: { labelsBefore: 4, labelsAfter: 6, moreButtons: 1, moreClicked: 1, popupLabels: 2 } },
  };
  try {
    const p = await handle("GET", "/api/plan?from=2026-11-02&to=2026-11-06&fresh=1");
    assert.deepEqual(moves, [[7, "https://outlook.office.com/calendar/view/workweek/2026/11/2"]]);
    assert.equal(p.trace.counts.Outlook, "moved to 2026-11-02");
    assert.match(p.trace.counts["a) Outlook labels (before → after +N more)"], /4 → 6 \(\+2 in popups, 1\/1 buttons clicked\)/);
    // the week is on screen now: no second move
    await handle("GET", "/api/plan?from=2026-11-02&to=2026-11-06&fresh=1");
    assert.equal(moves.length, 1);
    // typing in Outlook: the tab is left alone, and the Status page says why
    busy = true;
    const p2 = await handle("GET", "/api/plan?from=2026-10-26&to=2026-10-30&fresh=1");
    assert.equal(moves.length, 1);
    assert.ok(p2.warnings.some((w) => /working in Outlook/.test(w)));
    assert.equal(created, 0);
    // no Outlook tab at all: nothing is opened
    chrome.tabs = { ...chrome.tabs, query: async () => [] };
    await handle("GET", "/api/plan?from=2026-10-19&to=2026-10-23&fresh=1");
    assert.equal(created, 0);
  } finally {
    chrome.tabs = saved;
    Object.assign(console, { info: quiet.info, log: quiet.log, table: quiet.table, groupCollapsed: quiet.group, groupEnd: quiet.end });
  }
});

test("all-day choices are saved per day and event, and reset per day", async () => {
  await handle("POST", "/api/allday", { date: "2026-11-05", key: "delta|2026-11-05T00:00|2026-11-06T00:00", on: true, issue: "PRJ-224", minutes: 90 });
  assert.deepEqual(store.all_day_choices["2026-11-05|delta|2026-11-05T00:00|2026-11-06T00:00"], { on: true, issue: "PRJ-224", minutes: 90 });
  await handle("POST", "/api/allday", { date: "2026-11-05", key: "delta|2026-11-05T00:00|2026-11-06T00:00", minutes: null });
  assert.deepEqual(store.all_day_choices["2026-11-05|delta|2026-11-05T00:00|2026-11-06T00:00"], { on: true, issue: "PRJ-224" });
  await assert.rejects(handle("POST", "/api/allday", { date: "2026-11-05", key: "x", minutes: 5000 }), /between 0 and 24/);
  await handle("POST", "/api/allday/reset", { date: "2026-11-05" });
  assert.deepEqual(store.all_day_choices, {});
});

test("posting remembers which calendar events each worklog came from (so it never comes back orange)", async () => {
  const p = await handle("GET", "/api/plan?from=2026-11-09&to=2026-11-13&fresh=1");
  const e = p.days[0].entries[0];
  await handle("POST", "/api/fill", { from: "2026-11-09", to: "2026-11-13", approved: [e.id] });
  const link = store.posted_links.byId["1"];
  assert.equal(link.issue, e.issue);
  assert.deepEqual(link.event_keys, e.event_keys);
  assert.ok(link.event_keys.length > 0);
  assert.ok(store.posted_links.byContent[`${e.issue}|${e.started}|${e.minutes}`]);
});

test("internal issue: choose its chart; back to internal; a wrong value is refused", async () => {
  const INT = { id: "e-int", kind: "epic", name: "Internal activities", auto_internal: true, type_mode: "internal", keywords: [], status_mode: "auto",
    issues: [{ key: "INT-19", label: "Training", status_category: "new" }] };
  store.projects = { projects: [ALPHA, INT], last_refresh: null };
  await handle("PATCH", "/api/projects/e-int", { issue_types: { "INT-19": "install" } });
  assert.equal(store.projects.projects.find((p) => p.id === "e-int").issues[0].work_type, "install");
  await assert.rejects(handle("PATCH", "/api/projects/e-int", { issue_types: { "INT-19": "fun" } }), /internal, training, vacation \/ absence, pre-sale, project, installation or general/);
  await handle("PATCH", "/api/projects/e-int", { issue_types: { "INT-19": "general" } });
  assert.equal(store.projects.projects.find((p) => p.id === "e-int").issues[0].work_type, "general");
  await handle("PATCH", "/api/projects/e-int", { issue_types: { "INT-19": "internal" } }); // the default again
  assert.equal(store.projects.projects.find((p) => p.id === "e-int").issues[0].work_type, undefined);
});

test("security: the Jira API token is kept apart from the settings the Outlook page reader loads", async () => {
  store.settings = { ...store.settings, jira_token: "old-token-from-an-older-version" };
  const s = await handle("GET", "/api/settings");
  assert.equal(s.jira_token, ""); // never shown in the page
  assert.equal(store.settings.jira_token, undefined, "moved out of the settings");
  assert.equal(store.jira_secret, "old-token-from-an-older-version");
  await handle("POST", "/api/settings", { jira_auth: "token", jira_email: "me@example.com", jira_token: "new-token" });
  assert.equal(store.settings.jira_token, undefined);
  assert.equal(store.jira_secret, "new-token");
  await handle("POST", "/api/settings", { lunch_start: "12:30" }); // an empty token field keeps the stored one
  assert.equal(store.jira_secret, "new-token");
  await assert.rejects(handle("POST", "/api/settings", { lunch_end: "30:00" }), /00:00 to 24:00/);
});

test("security: an Outlook tab that doesn't show the calendar (e.g. mail) is never moved to another week", async () => {
  const quiet = ["info", "log", "table", "groupCollapsed", "groupEnd"].map((k) => [k, console[k]]);
  quiet.forEach(([k]) => { console[k] = () => {}; });
  const saved = chrome.tabs, moves = [];
  chrome.tabs = {
    query: async () => [{ id: 7, url: "https://outlook.office.com/mail/inbox" }],
    update: async (id, o) => moves.push([id, o.url]),
    sendMessage: async (_id, msg) => msg.type === "timefill-busy" ? { busy: false, onCalendar: false }
      : { ok: true, count: 1, visibleDates: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"], method: "headers", url: "x", stats: {} },
  };
  try {
    await handle("GET", "/api/plan?from=2026-11-02&to=2026-11-06&fresh=1");
    assert.deepEqual(moves, []);
  } finally { chrome.tabs = saved; quiet.forEach(([k, f]) => { console[k] = f; }); }
});

test("speed: the weeks next to the shown one are loaded from Jira only (Outlook untouched), then shown with no reading", async () => {
  const saved = chrome.tabs, realFetch = globalThis.fetch;
  let outlookCalls = 0, jiraCalls = 0;
  chrome.tabs = { ...saved, query: async () => [{ id: 3, url: "https://outlook.office.com/calendar/view/week" }],
    sendMessage: async () => { outlookCalls++; return { ok: true, visibleDates: [] }; }, update: async () => { outlookCalls++; } };
  globalThis.fetch = async (url, init) => { if (String(url).includes("atlassian")) jiraCalls++; return realFetch(url, init); };
  const quiet = ["info", "log", "table", "groupCollapsed", "groupEnd"].map((k) => [k, console[k]]);
  quiet.forEach(([k]) => { console[k] = () => {}; });
  try {
    assert.deepEqual(await handle("GET", "/api/plan?from=2026-11-16&to=2026-11-20&prefetch=1"), { ok: true });
    assert.equal(outlookCalls, 0, "Outlook is not touched by the background loading");
    assert.ok(jiraCalls > 0, "Jira was read");
    const before = jiraCalls;
    store.calendar_cache["2026-11-16"] = { read_at: "x", events: [] }; // that week was read from Outlook before
    for (const d of ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]) store.calendar_cache[d] = { read_at: "x", events: [] };
    await handle("GET", "/api/plan?from=2026-11-16&to=2026-11-20");
    assert.equal(jiraCalls, before, "going to that week reads nothing again");
  } finally { chrome.tabs = saved; globalThis.fetch = realFetch; quiet.forEach(([k, f]) => { console[k] = f; }); }
});

test("speed: the Charts read this week first (quick), then the whole history", async () => {
  const q = await handle("GET", "/api/report?quick=1&fresh=1");
  assert.equal(q.partial, true);
  assert.equal(q.weeks.length, 1, "only the current week");
  const full = await handle("GET", "/api/report?fresh=1");
  assert.equal(full.partial, undefined);
});
