// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Runs inside the extension page. Answers the same "/api/..." calls the UI makes,
// using chrome.storage for data, the Outlook tab for the calendar and Jira's REST API.

import { JiraClient, JiraError, adfText, jiraOrigin } from "./jira.js";
import { addDaysIso, buildPlan, classify, detectPhase, detectRole, hm, isSkippedEvent, isoOf, matchTarget, splitList, workWindows } from "./planner.js";
import { buildReport } from "./report.js";
import { DEFAULT_PHASES, DEFAULT_ROLES, INTERNAL_TYPES, WORK_TYPES, defaultRoleOf, phasesOf, rolesOf } from "./config.js";
import * as proj from "./projects.js";

export const OUTLOOK_TABS = ["https://outlook.office.com/*", "https://outlook.office365.com/*", "https://outlook.cloud.microsoft/*"];

export const DEFAULT_SETTINGS = {
  // Jira
  jira_url: "",
  jira_auth: "browser", // "browser" (your Chrome login) or "token"
  jira_email: "",
  jira_token: "",
  project_jql: "assignee = currentUser() ORDER BY key",
  // Custom field that groups standalone issues into one project (falls back to the code at the start of the summary).
  studio_field: "", // optional: name of a Jira field holding the project code (else the code at the start of the summary)
  // Issues you logged time on (since "track from") are added to the project list too. Empty = off.
  worked_jql: "worklogAuthor = currentUser() AND worklogDate >= \"{track_from}\" ORDER BY key",
  // Nothing before this day is checked or read.
  track_from: "2026-10-01",
  // Outlook web
  outlook_week_url: "https://outlook.office.com/calendar/view/workweek/{yyyy}/{m}/{d}",
  numeric_date_order: "dmy",
  show_outlook_badge: true,
  expand_more_events: true, // click "+N more events" to read hidden events (never edits anything)
  // Calendars that are yours. If Outlook also shows another one (e.g. a colleague's), the page is not read.
  own_calendars: "Calendar, Calendario, Kalender, Calendrier",
  // Work schedule
  day_start: "08:00",
  lunch_start: "12:30",
  lunch_end: "13:30",
  hours_per_weekday: [8, 8, 8, 8, 7, 0, 0], // Mon..Sun
  holidays: "",
  rounding_minutes: 15,
  clip_to_working_hours: false, // false: calendar work before/after the working hours counts normally
  // Mapping rules
  // Phases (lifecycle order) and roles: their names in Jira, what Timefill shows, the event-title words that
  // choose them, and the chart type of each phase. Edited in Settings → Phases & roles (see config.js).
  phases: DEFAULT_PHASES,
  roles: DEFAULT_ROLES,
  default_role: "SD",
  vacation_issue: "", // the Jira issue where leave / vacation is logged, e.g. LEAVE-1
  vacation_keywords: "vacation, vacanza, ferie, holiday, out of office, OOO",
  use_oof_status: true,
  ignore_keywords: "lunch, pranzo",
  comment_with_subject: true,
};

class ApiError extends Error {}

/* ----------------------------------------------------------------- storage */
async function load(key, fallback) {
  const o = await chrome.storage.local.get(key);
  return o[key] ?? structuredClone(fallback);
}
const save = (key, value) => chrome.storage.local.set({ [key]: value });


export async function getSettings() {
  const stored = await load("settings", {});
  // The Jira API token is stored on its own ("jira_secret"), not in "settings": the reader in the Outlook tab loads
  // the settings, and must never have the token. A token saved by an older version is moved there.
  if (stored.jira_token) {
    await save("jira_secret", stored.jira_token);
    delete stored.jira_token;
    await save("settings", stored);
  }
  const s = { ...DEFAULT_SETTINGS, ...stored, jira_token: await load("jira_secret", "") };
  // settings saved before phases/roles were editable: keep their title words (config.js reads the old keys)
  if (!Array.isArray(stored.phases)) s.phases = phasesOf(stored);
  if (!Array.isArray(stored.roles)) s.roles = rolesOf(stored);
  proj.configure(s);
  return s;
}

// 1.26.0 could read your calendar from Microsoft; that was removed: its sign-in and settings are forgotten.
globalThis.chrome?.storage?.local?.remove?.("graph_auth")?.catch?.(() => {});
// 1.27.x remembered per event whose calendar it was (by colour / card); that guessing was removed.
globalThis.chrome?.storage?.local?.remove?.("calendar_memory")?.catch?.(() => {});

async function saveSettings(body) {
  const cur = await getSettings();
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (!(k in body)) continue;
    if (k === "jira_token" && !body[k]) continue; // empty field = keep the stored token
    cur[k] = body[k];
  }
  if (cur.hours_per_weekday.length !== 7) throw new ApiError("hours per day needs 7 values");
  cur.hours_per_weekday = cur.hours_per_weekday.map((h) => parseFloat(h) || 0);
  for (const k of ["day_start", "lunch_start", "lunch_end"]) hm(cur[k]);
  cur.track_from = String(cur.track_from || "").trim();
  if (cur.track_from && !/^\d{4}-\d{2}-\d{2}$/.test(cur.track_from)) throw new ApiError("“Track from” must be a date like 2026-10-01");
  // phases & roles: cleaned up; at least one of each, names unique
  cur.phases = phasesOf({ phases: cur.phases });
  cur.roles = rolesOf({ roles: cur.roles });
  if (!cur.phases.length) throw new ApiError("Add at least one phase (Settings → Phases & roles).");
  if (!cur.roles.length) throw new ApiError("Add at least one role (Settings → Phases & roles).");
  if (cur.phases.some((p) => !WORK_TYPES.includes(p.type))) throw new ApiError("Each phase needs a chart type.");
  cur.default_role = defaultRoleOf(cur);
  if (hm(cur.lunch_end) < hm(cur.lunch_start)) throw new ApiError("Lunch must end after it starts (same time = no lunch break).");
  cur.jira_url = String(cur.jira_url || "").trim();
  if (cur.jira_url) cur.jira_url = jiraOrigin(cur.jira_url);
  outlookUrl(cur.outlook_week_url.replace(/\{[a-z]+\}/gi, "1"));
  // another Jira site or login: the cached account id belongs to someone else now
  const before = await getSettings();
  if (["jira_url", "jira_auth", "jira_email"].some((k) => before[k] !== cur[k])) {
    const data = await loadProjects();
    if (data.account_id) { delete data.account_id; await save("projects", data); }
    clearJiraCopy(); // those worklogs belong to the other site / login
  }
  const { jira_token: token, ...rest } = cur;
  await save("settings", rest); // without the token
  await save("jira_secret", token || "");
  proj.configure(cur);
  return cur;
}

/** "Open week in Outlook" may only open Outlook web. */
function outlookUrl(url) {
  let u;
  try { u = new URL(String(url || "")); } catch { u = null; }
  if (!u || u.protocol !== "https:" || !/^outlook\.(office\.com|office365\.com|cloud\.microsoft)$/i.test(u.hostname))
    throw new ApiError("The “Open week” link must be an Outlook web address (https://outlook.office.com/…).");
  return u.toString();
}

const publicSettings = (s) => ({ ...s, jira_token: "", token_set: !!s.jira_token });
const loadProjects = () => load("projects", { projects: [], last_refresh: null });
const loadOverrides = () => load("overrides", []);
// Differences between Jira and the calendar that you chose to ignore (ids from planner.compareDay).
const loadIgnoredDiffs = () => load("ignored_diffs", []);
// Your choices for all-day events: "<day>|<event key>" -> { on, issue, minutes }
const loadAllDayChoices = () => load("all_day_choices", {});
// Worklogs Timefill posted, and the calendar events (or your entries) each came from, so that reading them back from
// Jira never shows them as "not like your calendar". byId[worklog id] and byContent["issue|start|minutes"].
const loadLinks = () => load("posted_links", { byId: {}, byContent: {} });
async function rememberLink({ id, issue, start, minutes, event_keys, labels }) {
  const links = await loadLinks();
  const link = { issue, start, minutes, event_keys, labels };
  if (id != null) links.byId[String(id)] = link;
  links.byContent[`${issue}|${start}|${Math.round(minutes)}`] = link;
  const cutoff = addDaysIso(isoOf(new Date()), -150); // old ones are forgotten
  for (const m of [links.byId, links.byContent]) for (const [k, v] of Object.entries(m)) if ((v.start || "").slice(0, 10) < cutoff) delete m[k];
  await save("posted_links", links);
}
/** A worklog Timefill posted was moved or resized (or copied to another issue): it keeps its events. */
async function moveLink(oldId, to) {
  const links = await loadLinks();
  const link = links.byId[String(oldId)];
  if (!link) return;
  delete links.byId[String(oldId)];
  delete links.byContent[`${link.issue}|${link.start}|${Math.round(link.minutes)}`];
  await save("posted_links", links);
  await rememberLink({ ...link, ...to });
}

async function jira() {
  const s = await getSettings();
  if (s.jira_url) jiraOrigin(s.jira_url); // throws unless https://<name>.atlassian.net
  return new JiraClient(s);
}

async function accountId(j) {
  const data = await loadProjects();
  if (!data.account_id) {
    data.account_id = (await j.myself()).accountId;
    await save("projects", data);
  }
  return data.account_id;
}

/* ----------------------------------------------------------------- Outlook */
const timeout = (ms, what) => new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms));

async function askTab(tabId, msg) {
  try {
    return await Promise.race([chrome.tabs.sendMessage(tabId, msg), timeout(msg?.type === "timefill-read" ? 30000 : 10000, "Outlook tab")]);
  } catch (e) {
    // Tab was open before the extension was installed/reloaded: inject the reader, then ask again.
    if (!/Receiving end does not exist|Could not establish connection/i.test(e.message)) throw e;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["outlook-parser.js", "content.js"] });
    return Promise.race([chrome.tabs.sendMessage(tabId, msg), timeout(msg?.type === "timefill-read" ? 30000 : 10000, "Outlook tab")]);
  }
}

/* While this page is open it keeps a connection to every Outlook tab. The reader in the tab watches the
   calendar only while it has a connection, so closing the Timefill tab stops all reading. */
const connected = new Map(); // tabId -> port
const isOutlook = (url) => /^https:\/\/outlook\.(office\.com|office365\.com|cloud\.microsoft)\//i.test(url || "");

async function connectTab(tab) {
  if (connected.has(tab.id)) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["outlook-parser.js", "content.js"] });
    const port = chrome.tabs.connect(tab.id, { name: "timefill-app" });
    connected.set(tab.id, port);
    port.onDisconnect.addListener(() => {
      // Chrome closed the connection (tab reloaded/closed, or this page went into the back/forward cache).
      // Reading lastError marks the reason as handled, so Chrome doesn't log "Unchecked runtime.lastError".
      void chrome.runtime.lastError;
      if (connected.get(tab.id) === port) connected.delete(tab.id);
    });
  } catch { /* tab not ready (e.g. still loading or signed out): tabs.onUpdated retries */ }
}

function disconnectAll() {
  for (const port of connected.values()) { try { port.disconnect(); } catch { /* already closed */ } }
  connected.clear();
}

/** Called once by the Timefill page: connect the Outlook tabs that are open now and those opened later. */
export async function watchOutlookTabs() {
  // When this page is put in the back/forward cache (you navigated the Timefill tab elsewhere), close the
  // connections ourselves, so Outlook stops reading; reconnect when the page is shown again.
  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("pagehide", disconnectAll);
    globalThis.addEventListener("pageshow", async (ev) => {
      if (!ev.persisted) return;
      for (const t of await chrome.tabs.query({ url: OUTLOOK_TABS })) connectTab(t);
    });
  }
  for (const t of await chrome.tabs.query({ url: OUTLOOK_TABS })) connectTab(t);
  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (info.status !== "complete" || !isOutlook(tab.url)) return;
    connected.get(id)?.disconnect();
    connected.delete(id);
    connectTab(tab);
  });
  chrome.tabs.onRemoved.addListener((id) => connected.delete(id));
}

/** Ask every open Outlook tab to read its calendar (the tab saves what it sees into the cache). */
export async function readOutlookTabs() {
  const tabs = await chrome.tabs.query({ url: OUTLOOK_TABS });
  const results = [];
  for (const t of tabs) {
    try {
      const r = await askTab(t.id, { type: "timefill-read" });
      results.push(r || { ok: false, error: "tab is not on the calendar" });
    } catch (e) { results.push({ ok: false, error: e.message }); }
  }
  return { tabs: tabs.length, results };
}

async function diagnoseOutlook(find = "") {
  const tabs = await chrome.tabs.query({ url: OUTLOOK_TABS });
  if (!tabs.length) throw new ApiError("No Outlook tab is open. Open your Outlook calendar (week view) in this browser first.");
  const reports = [];
  for (const t of tabs) {
    try { reports.push(await askTab(t.id, { type: "timefill-diagnose", find })); }
    catch (e) { reports.push({ url: t.url, error: e.message }); }
  }
  return reports;
}

function weekUrl(s, day) {
  const [y, m, d] = day.split("-");
  return outlookUrl(s.outlook_week_url
    .replace("{yyyy}", y).replace("{mm}", m).replace("{dd}", d)
    .replace("{m}", String(+m)).replace("{d}", String(+d)));
}
async function openOutlookWeek(day) {
  const url = weekUrl(await getSettings(), day);
  await chrome.tabs.create({ url });
  return { url };
}

/**
 * Read the Outlook tabs, and make sure the days from..to were read: if no tab shows them, one Outlook tab is
 * moved to that week (only its view changes; nothing in your calendar is changed) and read once it has loaded.
 * Not done while you are typing or have a form / popup open in that tab. With no Outlook tab open nothing is
 * opened (the Status page tells you to press "Open week in Outlook"). Microsoft Graph would need a sign-in of its
 * own, so Timefill reads the page.
 */
async function readOutlookWeek(from, to, s) {
  const need = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) if (workWindows(d, s).length) need.push(d);
  const outlook = await readOutlookTabs();
  const shows = (r) => r?.ok && need.every((d) => (r.visibleDates || []).includes(d));
  if (!need.length || outlook.results.some(shows)) return outlook;
  // a tab that could not be read (slow, still loading) is not moved: only a tab that clearly shows another week
  if (outlook.results.some((r) => r?.paused) || !outlook.results.some((r) => r?.ok && (r.visibleDates || []).length)) return outlook;
  const tabs = await chrome.tabs.query({ url: OUTLOOK_TABS });
  if (!tabs.length) return outlook;
  let tabId = null;
  for (const tab of tabs) {
    // only a tab showing the calendar (never mail, never one where you are typing or have a form open)
    try { const b = await askTab(tab.id, { type: "timefill-busy" }); if (b && !b.busy && b.onCalendar) { tabId = tab.id; break; } } catch { /* not ready */ }
  }
  if (tabId === null) {
    outlook.navigation = "not moved to that week: you are working in Outlook (typing, or a form is open)";
    return outlook;
  }
  const url = weekUrl(s, need[0]);
  await chrome.tabs.update(tabId, { url });
  outlook.navigation = `moved to ${need[0]}`;
  console.info("[Timefill] Outlook did not show", need[0], "→", need[need.length - 1], "- opening", url);
  // Wait until the tab shows the week, and the number of events stops changing (Outlook loads them after the grid).
  const until = Date.now() + 25000;
  let last = null, stable = 0, res = null;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1200));
    try { res = await askTab(tabId, { type: "timefill-read" }); } catch { continue; }
    if (!shows(res)) continue;
    stable = res.count === last ? stable + 1 : 0;
    last = res.count;
    if (stable >= 1) break;
  }
  if (!shows(res)) { outlook.navigation += ", but it did not show that week within 25 s"; return outlook; }
  outlook.results.push(res);
  outlook.tabs = Math.max(outlook.tabs, 1);
  return outlook;
}

/** Stage-by-stage counts for a week, logged in the console of the Timefill tab (DevTools -> Console). */
function traceWeek(from, to, outlook, events, plan, projects, s, log = true) {
  const inRange = (e) => e.start.slice(0, 10) <= to && e.end > `${from}T00:00`;
  const reads = (outlook?.results || []).filter((r) => r?.ok);
  const perTab = reads.map((r) => ({ tab: r.url, days: `${r.visibleDates?.[0] || "?"} → ${r.visibleDates?.at(-1) || "?"}`, ...r.stats, allDay: undefined, popupSample: undefined }));
  const evs = events.filter(inRange);
  const kept = evs.filter((e) => !isSkippedEvent(e));
  const classified = kept.map((e) => ({ e, c: classify(e, projects, s) }));
  const freeIgnored = classified.filter(({ e, c }) => e.allDay && e.busy === 0 && c.type === "ignored");
  const byType = {};
  for (const { c } of classified) byType[c.type] = (byType[c.type] || 0) + 1;
  const busyName = ["free", "tentative", "busy", "out of office", "working elsewhere"];
  const allDay = classified.filter(({ e }) => e.allDay).map(({ e, c }) => ({
    subject: e.subject, from: e.start.slice(0, 10), to_incl: addDaysIso(e.end.slice(0, 10), -1), busy: busyName[e.busy] ?? e.busy,
    result: c.type, project: c.project || "", issue: c.issue || "", reason: c.reason || "" }));
  const allDayNames = new Set(classified.filter(({ e, c }) => e.allDay && c.type === "project").map(({ e }) => e.subject));
  const fill = plan.days.map((d) => ({ day: d.date, read: d.calendar_read ? "yes" : "NOT READ", expected_h: d.target / 60, in_jira_h: d.logged / 60,
    all_day_fill_h: d.segments.filter((x) => x.kind === "planned" && allDayNames.has(x.label)).reduce((n, x) => n + x.end - x.start, 0) / 60,
    to_fill_h: d.planned / 60, state: d.state }));
  const counts = {
    "a) Outlook labels (before → after +N more)": reads.map((r) => `${r.stats?.labelsBefore ?? "?"} → ${r.stats?.labelsAfter ?? "?"} (+${r.stats?.popupLabels ?? 0} in popups, ${r.stats?.moreClicked ?? 0}/${r.stats?.moreButtons ?? 0} buttons clicked)`).join("; ") || "not read now (stored copy used)",
    "b) events in range (all-day)": `${evs.length} (${evs.filter((e) => e.allDay).length})`,
    "c) after declined/cancelled/Free filter": `${kept.length - freeIgnored.length} (removed ${evs.length - kept.length} declined/cancelled, ${freeIgnored.length} Free all-day without keyword)`,
    "d) keyword match": `${byType.project || 0} project, ${byType.vacation || 0} vacation, ${byType.unmatched || 0} not matched, ${byType.ignored || 0} ignored`,
    "e) proposed (to fill)": `${plan.totals.planned / 60} h in ${plan.days.reduce((n, d) => n + d.entries.length, 0)} worklogs`,
  };
  if (outlook?.navigation) counts["Outlook"] = outlook.navigation;
  if (!log) return { counts, outlook: perTab, all_day: allDay, fill };
  console.groupCollapsed(`[Timefill] trace ${from} → ${to}`);
  console.table(counts);
  if (perTab.length) { console.log("a) Outlook read per tab"); console.table(perTab); }
  console.log("b–d) all-day events and their keyword match"); console.table(allDay);
  console.log("e) fill per day"); console.table(fill);
  console.groupEnd();
  return { counts, outlook: perTab, all_day: allDay, fill };
}

function eventsFromCache(cache, from, to) {
  const seen = new Set(), events = [], unread = [], readAt = {};
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const c = cache[d];
    if (!c) { unread.push(d); continue; }
    readAt[d] = c.read_at;
    for (const e of c.events) {
      const k = `${String(e.subject).toLowerCase()}|${e.start}|${e.end}`; // same rule as the parser: title + start + end
      if (!seen.has(k)) { seen.add(k); events.push(e); }
    }
  }
  return { events, unread, readAt };
}

/* -------------------------------------------------------------------- plan */
/* Your Jira worklogs per week, as last read. Jira and the Outlook tabs are read only when you open the
   Status page or press Refresh (fresh), for a week not read yet, and right before posting (strict).
   Everything else (assigning, dragging, undo...) re-plans from this copy: instant, no network. After
   Timefill itself changes Jira, the copy is updated in place (see rememberWorklog / forgetWorklog). */
const jiraWeeks = new Map(); // "from|to" -> { worklogs, ok, warning, at }

export function rememberWorklog(w) {
  for (const [range, c] of jiraWeeks) {
    const [from, to] = range.split("|");
    if (!c.ok || w.start.slice(0, 10) < from || w.start.slice(0, 10) > to) continue;
    c.worklogs = [...c.worklogs.filter((x) => String(x.id) !== String(w.id)), w];
  }
}
/** Forget everything read from Jira (another Jira site/login; tests). */
export function clearJiraCopy() { jiraWeeks.clear(); reportCopy = null; }

/* Charts: your worklogs since "Track from", read when you open the Charts page or press Refresh. */
let reportCopy = null;
async function computeReport(fresh, quick = false) {
  const s = await getSettings();
  const today = isoOf(new Date());
  const from = s.track_from && s.track_from <= today ? s.track_from : addDaysIso(today, -56);
  // quick: only this week (shown first, in a moment); the whole history follows with a normal request
  if (quick && (fresh || !reportCopy || reportCopy.from !== from || reportCopy.to !== today)) {
    const [y, m, d] = today.split("-").map(Number);
    const monday = addDaysIso(today, -((new Date(y, m - 1, d).getDay() + 6) % 7));
    const qFrom = monday > from ? monday : from;
    const j = await jira();
    const worklogs = await j.myWorklogsBetween(await accountId(j), qFrom, today);
    const projects = (await loadProjects()).projects;
    return { ...buildReport(worklogs, projects, s, { from: qFrom, to: today, today }), jira_read_at: new Date().toISOString(), partial: true };
  }
  if (fresh || !reportCopy || reportCopy.from !== from || reportCopy.to !== today) {
    const j = await jira();
    reportCopy = { from, to: today, worklogs: await j.myWorklogsBetween(await accountId(j), from, today), at: new Date().toISOString() };
  }
  const projects = (await loadProjects()).projects;
  return { ...buildReport(reportCopy.worklogs, projects, s, { from, to: today, today }), jira_read_at: reportCopy.at };
}
export function forgetWorklog(id) {
  for (const c of jiraWeeks.values()) c.worklogs = c.worklogs.filter((x) => String(x.id) !== String(id));
}
const summaryOf = (issue) => {
  for (const c of jiraWeeks.values()) { const w = c.worklogs.find((x) => x.issue === issue && x.summary); if (w) return w.summary; }
  return "";
};

async function computePlan(from, to, { strict = false, fresh = false, prefetch = false } = {}) {
  const s = await getSettings();
  const warnings = [];
  const key = `${from}|${to}`;
  const readJira = strict || fresh || !jiraWeeks.has(key);
  let outlook = { tabs: 0, results: [] };
  // A week never read before is read now, also when you only moved to it (Outlook is moved to it if needed).
  const neverRead = async () => {
    const c = await load("calendar_cache", {});
    for (let d = from; d <= to; d = addDaysIso(d, 1)) if (!c[d] && workWindows(d, s).length) return true;
    return false;
  };
  if (strict) { try { outlook = await readOutlookTabs(); } catch (e) { warnings.push(`Outlook: ${e.message}`); } }
  // prefetch (the weeks next to the one you look at): Jira only, Outlook is never touched for it
  else if (!prefetch && (fresh || await neverRead())) { try { outlook = await readOutlookWeek(from, to, s); } catch (e) { warnings.push(`Outlook: ${e.message}`); } }
  else { try { outlook.tabs = (await chrome.tabs.query({ url: OUTLOOK_TABS })).length; } catch { /* only shown as a count */ } }
  if (outlook.navigation && /not moved|did not/.test(outlook.navigation)) warnings.push(`Outlook ${outlook.navigation}.`);
  for (const r of outlook.results || []) if (r?.paused) warnings.push(r.error);
    else if (r?.hid_calendars?.length) console.info(`[Timefill] read only your calendar (${r.hid_calendars.join(", ")} unticked for the read, then ticked again)`);
  const { events, unread, readAt } = eventsFromCache(await load("calendar_cache", {}), from, to);
  const unreadWorking = unread.filter((d) => workWindows(d, s).length > 0);
  if (unreadWorking.length)
    warnings.push(outlook.tabs
      ? `Calendar not read yet for ${unreadWorking.join(", ")}. Show that week in your Outlook tab (week or work-week view), then press “↻ Refresh”.`
      : `No Outlook tab is open and the calendar was never read for ${unreadWorking.join(", ")}. Press “Open week in Outlook”, wait for it to load, then “↻ Refresh”.`);

  let worklogs = [], jiraOk = true;
  if (readJira) {
    try {
      const j = await jira();
      const jiraFrom = s.track_from && s.track_from > from ? s.track_from : from; // nothing before "track from" is read
      if (jiraFrom <= to) worklogs = await j.myWorklogsBetween(await accountId(j), jiraFrom, to);
      jiraWeeks.set(key, { worklogs, ok: true, at: new Date().toISOString() });
    } catch (e) {
      if (strict) throw e;
      jiraOk = false;
      jiraWeeks.set(key, { worklogs: [], ok: false, warning: `Jira: ${e.message}`, at: new Date().toISOString() });
    }
  }
  const week = jiraWeeks.get(key);
  worklogs = week.worklogs;
  jiraOk = week.ok;
  if (week.warning) warnings.push(week.warning);
  const projects = (await loadProjects()).projects;
  const plan = buildPlan(from, to, events, worklogs, projects, s, await loadOverrides(), new Date(), new Set(await loadIgnoredDiffs()), await loadAllDayChoices(), await loadLinks());
  // "<project> – <phase>" for every issue on screen, from stored projects and the summaries Jira already
  // sent with your worklogs (kept in issue_titles, so no extra requests).
  const cache = await load("issue_titles", {});
  const titles = { ...cache, ...proj.titleMap(projects) };
  let learned = false;
  for (const w of worklogs) if (w.summary && !titles[w.issue]) { titles[w.issue] = cache[w.issue] = proj.titleFromSummary(w.summary); learned = true; }
  if (learned) await save("issue_titles", cache);
  if (s.vacation_issue && !titles[s.vacation_issue]) titles[s.vacation_issue] = "Vacation";
  plan.titles = titles;
  for (const d of plan.days) { d.calendar_read = !!readAt[d.date]; d.read_at = readAt[d.date] || null; }
  // the trace is logged to the console only when something was read (not on every local redraw)
  try { plan.trace = traceWeek(from, to, outlook, events, plan, projects, s, readJira || outlook.results.length > 0); } catch (e) { console.warn("[Timefill] trace failed", e); }
  return { ...plan, warnings, jira_ok: jiraOk, event_count: events.length, outlook_tabs: outlook.tabs, jira_read_at: week.at, read_now: readJira };
}

/** Move or resize one of your worklogs that is already in Jira (after you confirmed it on the calendar). */
async function moveWorklog(issue, id, body) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) throw new ApiError("date is required");
  const start = hm(body.start);
  const minutes = Math.round(Number(body.minutes));
  if (!(minutes >= 1)) throw new ApiError("the worklog must be at least 1 minute");
  if (start + minutes > 24 * 60) throw new ApiError("a worklog cannot run past midnight");
  const j = await jira();
  const [cur, me] = await Promise.all([j.worklog(issue, id), j.myself()]); // fresh: who is signed in now
  if (!me?.accountId || (cur.author || {}).accountId !== me.accountId) throw new ApiError("you can only change your own worklogs");
  const target = body.issue ? issueKeyOf(body.issue) : issue;
  if (!target) throw new ApiError("pick a project and phase");
  if (target === issue) {
    await j.updateWorklog(issue, id, `${body.date}T${body.start}`, minutes * 60, cur.comment || null);
    await moveLink(id, { id, issue, start: `${body.date}T${body.start}`, minutes });
    forgetWorklog(id);
    rememberWorklog({ id, issue, summary: summaryOf(issue), start: `${body.date}T${body.start}`, seconds: minutes * 60, comment: adfText(cur.comment) });
    return { ok: true };
  }
  // Jira can't move a worklog to another issue: create it on the new issue (same time and comment),
  // then delete the old one. If the delete fails, say so - otherwise the time would count twice.
  const created = await j.addWorklog(target, `${body.date}T${body.start}`, minutes * 60, cur.comment || "");
  await moveLink(id, { id: created?.id, issue: target, start: `${body.date}T${body.start}`, minutes });
  rememberWorklog({ id: created?.id ?? `moved-${id}`, issue: target, summary: summaryOf(target), start: `${body.date}T${body.start}`, seconds: minutes * 60, comment: adfText(cur.comment) });
  try { await j.deleteWorklog(issue, id); forgetWorklog(id); }
  catch (e) { throw new ApiError(`The worklog was copied to ${target}, but the old one on ${issue} could not be deleted (${e.message}). Delete it in Jira, or it counts twice.`); }
  return { ok: true, issue: target, id: created?.id };
}

/** Project -> phase choices for the assign / edit boxes, with the phase detected for this event. */
function pickOptions(projects, s, label, current) {
  const role = label ? detectRole(label, s) : defaultRoleOf(s);
  const hit = label ? matchTarget(label, projects) : null;
  const list = [];
  for (const p of projects) {
    const has = current && p.issues.some((i) => i.key === current);
    const internal = proj.isInternal(p);
    const status = proj.effectiveStatus(p);
    if (!internal && status === "closed" && !has) continue;
    const open = p.issues.filter((i) => i.status_category !== "done");
    let suggested = has ? current
      : internal ? (hit?.project === p && hit.issue) || (open[0] || p.issues[0])?.key
      : proj.issueFor(p, role, label ? detectPhase(label, s) : null)[0] || proj.issueFor(p, role)[0] || (open[0] || p.issues[0])?.key;
    list.push({ id: p.id, name: p.name, internal, status: proj.statusName(status), suggested,
      phases: p.issues.map((i) => ({ key: i.key, label: i.label && i.label !== "main" ? i.label : i.summary || i.key, done: i.status_category === "done" })) });
  }
  list.sort((a, b) => a.internal - b.internal || a.name.localeCompare(b.name));
  if (s.vacation_issue) list.push({ id: "vacation", name: "Vacation", internal: true, status: "", suggested: s.vacation_issue, phases: [{ key: s.vacation_issue, label: "Vacation", done: false }] });
  const selected = list.find((x) => current && x.phases.some((i) => i.key === current))?.id || hit?.project?.id || null;
  return { projects: list, selected, role };
}

let filling = false;

async function fill(body) {
  const approved = (body.approved || []).filter((a) => typeof a === "string");
  if (!approved.length) throw new ApiError("nothing approved - tick the worklogs you want to post");
  if (filling) throw new ApiError("a fill is already running");
  filling = true;
  try {
    // Re-plan from fresh Jira data right before posting so nothing is logged twice.
    const plan = await computePlan(body.from, body.to, { strict: true });
    const fresh = Object.fromEntries(plan.days.flatMap((d) => d.entries.map((e) => [e.id, e])));
    const j = await jira();
    const done = [], failed = [], skipped = [], usedOverrides = new Set();
    for (const id of [...new Set(approved)]) {
      const e = fresh[id];
      if (!e) { skipped.push({ id, error: "changed or already in Jira since you reviewed it" }); continue; }
      try {
        const created = await j.addWorklog(e.issue, e.started, e.minutes * 60, e.comment);
        rememberWorklog({ id: created?.id ?? `posted-${id}`, issue: e.issue, summary: summaryOf(e.issue), start: e.started, seconds: e.minutes * 60, comment: e.comment || "" });
        await rememberLink({ id: created?.id, issue: e.issue, start: e.started, minutes: e.minutes, event_keys: e.event_keys || [], labels: e.labels || [] });
        done.push({ id });
        e.override_ids.forEach((o) => usedOverrides.add(o));
      } catch (x) { failed.push({ id, error: x.message }); }
    }
    // Used manual entries are done. One that replaced a calendar event stays as a marker, so that event
    // doesn't come back at its old time.
    if (usedOverrides.size)
      await save("overrides", (await loadOverrides()).flatMap((o) => !usedOverrides.has(o.id) ? [o]
        : o.replaces ? [{ id: o.id, date: o.date, replaces: o.replaces, skip: true, posted: true }] : []));
    return { done, failed, skipped };
  } finally { filling = false; }
}

/* ----------------------------------------------------- manual entries (overrides) */
/** The issue key in "KEY", "KEY — title" or "title · KEY" (pickers show the title first). */
export function issueKeyOf(text) {
  const all = String(text || "").toUpperCase().match(/(?<![A-Z0-9_])[A-Z][A-Z0-9_]*-\d+(?![\w-])/g) || [];
  return all.length ? all[all.length - 1] : "";
}

function overrideItem(body) {
  const issue = issueKeyOf(body.issue);
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issue)) throw new ApiError("pick an issue key like PRJ-224");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) throw new ApiError("date is required");
  const start = String(body.start || ""), end = String(body.end || "");
  if (hm(end) <= hm(start)) throw new ApiError("end must be after start");
  const item = { id: crypto.randomUUID().slice(0, 10), date: body.date, start, end, issue, label: body.label || "manual" };
  if (body.replaces) item.replaces = String(body.replaces);
  return item;
}

/* ------------------------------------------------------------------ router */
export async function handle(method, path, body = {}) {
  const url = new URL(path, "https://x");
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams);
  let m;
  try {
    if (method === "GET" && p === "/api/settings") return publicSettings(await getSettings());
    if (method === "POST" && p === "/api/settings") return publicSettings(await saveSettings(body));
    if (method === "POST" && p === "/api/test/jira") {
      const me = await (await jira()).myself();
      return { ok: true, user: me.displayName, email: me.emailAddress };
    }
    if (method === "POST" && p === "/api/outlook/read") {
      const r = await readOutlookTabs();
      if (!r.tabs) throw new ApiError("No Outlook tab is open.");
      const good = r.results.filter((x) => x.ok);
      if (!good.length) throw new ApiError(r.results.map((x) => x.error).join("; ") || "Outlook tab is not showing the calendar.");
      return { ok: true, events: good.reduce((a, x) => a + x.count, 0), days: [...new Set(good.flatMap((x) => x.visibleDates))].sort() };
    }
    if (method === "POST" && p === "/api/outlook/diagnose") return diagnoseOutlook(String(body?.find || ""));
    if (method === "POST" && p === "/api/outlook/open") return openOutlookWeek(body.date);

    if (method === "GET" && p === "/api/projects") {
      const data = await loadProjects();
      const s = await getSettings();
      return {
        projects: data.projects.map(proj.decorate), last_refresh: data.last_refresh, user: data.user, track_from: s.track_from, phase_names: proj.PHASE_NAMES, last_report: data.last_report || null, needs_refresh: data.model !== proj.MODEL_VERSION,
        jira_url: s.jira_url.trim().replace(/\/+$/, ""),
        configured: !!s.jira_url && (s.jira_auth !== "token" || !!s.jira_token),
      };
    }
    if (method === "POST" && p === "/api/projects/refresh") {
      const data = await loadProjects();
      const added = await proj.refresh(await jira(), await getSettings(), data);
      await save("projects", data);
      return { added, report: data.last_report };
    }
    if (method === "PATCH" && (m = /^\/api\/projects\/(.+)$/.exec(p))) {
      const data = await loadProjects();
      const pr = data.projects.find((x) => x.id === decodeURIComponent(m[1]));
      if (!pr) throw new ApiError("project not found");
      if ("status_mode" in body) {
        const allowed = ["auto", ...proj.allowedStatuses(pr)];
        if (!allowed.includes(body.status_mode)) throw new ApiError(`status must be one of ${allowed.join(", ")}`);
        pr.status_mode = body.status_mode;
      }
      if ("type_mode" in body) {
        if (!proj.TYPE_MODES.includes(body.type_mode)) throw new ApiError(`type must be one of ${proj.TYPE_MODES.join(", ")}`);
        pr.type_mode = body.type_mode;
      }
      if ("keywords" in body) pr.keywords = splitList(body.keywords);
      if (body.issue_keywords && typeof body.issue_keywords === "object")
        for (const [key, kw] of Object.entries(body.issue_keywords)) {
          const i = pr.issues.find((x) => x.key === key);
          if (!i) throw new ApiError(`issue ${key} is not part of this project`);
          i.keywords = splitList(kw);
        }
      // an internal issue: in which "type of work" chart its hours count (pre-sale, project, installation, general)
      if (body.issue_types && typeof body.issue_types === "object")
        for (const [key, type] of Object.entries(body.issue_types)) {
          const i = pr.issues.find((x) => x.key === key);
          if (!i) throw new ApiError(`issue ${key} is not part of this project`);
          if (!INTERNAL_TYPES.includes(type)) throw new ApiError("choose internal, training, vacation / absence, pre-sale, project, installation or general");
          if (type === "internal") delete i.work_type; else i.work_type = type; // internal is the default
        }
      pr.is_new = false;
      await save("projects", data);
      return proj.decorate(pr);
    }
    if (method === "GET" && p === "/api/pick") {
      const s = await getSettings();
      return pickOptions((await loadProjects()).projects, s, q.label || "", issueKeyOf(q.current || ""));
    }
    if (method === "GET" && p === "/api/jira/find") return proj.findProjects(await jira(), await getSettings(), q.q || "", await loadProjects());
    // add a project you found in Jira to your list (kept on every refresh)
    if (method === "POST" && p === "/api/projects/pin") {
      const key = issueKeyOf(body.key);
      if (!key) throw new ApiError("which project?");
      const data = await loadProjects();
      data.pinned = [...new Set([...(data.pinned || []), key])];
      const added = await proj.refresh(await jira(), await getSettings(), data);
      await save("projects", data);
      return { added, report: data.last_report };
    }
    if (method === "DELETE" && (m = /^\/api\/projects\/(.+)\/pin$/.exec(p))) {
      const data = await loadProjects();
      const pr = data.projects.find((x) => x.id === decodeURIComponent(m[1]));
      if (!pr) throw new ApiError("project not found");
      const keys = new Set([...pr.issues.map((i) => i.key), pr.epic?.key, ...(pr.merged_epics || []).map((e) => e.key)].filter(Boolean));
      data.pinned = (data.pinned || []).filter((k) => !keys.has(k));
      const yours = pr.issues.some((i) => i.via === "assigned" || i.via === "worked") || ["assigned", "worked"].includes(pr.epic?.via);
      if (yours) pr.pinned = false; else data.projects = data.projects.filter((x) => x !== pr);
      await save("projects", data);
      return { ok: true, removed: !yours };
    }
    if (method === "GET" && p === "/api/issues") {
      const s = await getSettings();
      return proj.allIssueOptions((await loadProjects()).projects, s.vacation_issue);
    }
    if (method === "GET" && p === "/api/report") return computeReport(q.fresh === "1", q.quick === "1");
    if (method === "GET" && p === "/api/plan") {
      if (q.prefetch === "1") { await computePlan(q.from, q.to, { prefetch: true }); return { ok: true }; } // loads Jira into the copy
      return computePlan(q.from, q.to, { fresh: q.fresh === "1" });
    }
    if (method === "POST" && p === "/api/fill") return fill(body);
    if (method === "PUT" && (m = /^\/api\/worklogs\/([^/]+)\/([^/]+)$/.exec(p))) return moveWorklog(decodeURIComponent(m[1]), decodeURIComponent(m[2]), body);

    if (method === "GET" && p === "/api/overrides") return loadOverrides();
    // All-day event of a day: tick / untick, project-phase, hours (null = back to the default split).
    if (method === "POST" && p === "/api/allday") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "") || !body.key || String(body.key).length > 400) throw new ApiError("which all-day event?");
      const all = await loadAllDayChoices();
      const id = `${body.date}|${body.key}`;
      const cur = { ...(all[id] || {}) };
      if ("on" in body) cur.on = !!body.on;
      if ("issue" in body) { if (body.issue) { const k = issueKeyOf(body.issue); if (!k) throw new ApiError("pick a project and phase"); cur.issue = k; } else delete cur.issue; }
      if ("minutes" in body) {
        if (body.minutes === null || body.minutes === "") delete cur.minutes;
        else { const m = Math.round(Number(body.minutes)); if (!(m >= 0 && m <= 1440)) throw new ApiError("hours must be between 0 and 24"); cur.minutes = m; }
      }
      all[id] = cur;
      const cutoff = addDaysIso(isoOf(new Date()), -150); // old days are forgotten
      for (const k of Object.keys(all)) if (k.slice(0, 10) < cutoff) delete all[k];
      await save("all_day_choices", all);
      return cur;
    }
    if (method === "POST" && p === "/api/allday/reset") { // back to the defaults for that day
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) throw new ApiError("which day?");
      const all = await loadAllDayChoices();
      for (const k of Object.keys(all)) if (k.startsWith(`${body.date}|`)) delete all[k];
      await save("all_day_choices", all);
      return { ok: true };
    }
    // Ignore differences between Jira and the calendar (or show them again). Nothing changes in Jira or Outlook.
    if (method === "POST" && (p === "/api/diffs/ignore" || p === "/api/diffs/unignore")) {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => /^(wl|ev):/.test(x) && x.length <= 400);
      if (!ids.length) throw new ApiError("nothing to change");
      const cur = await loadIgnoredDiffs();
      const next = p.endsWith("/ignore") ? [...cur.filter((x) => !ids.includes(x)), ...ids].slice(-5000) : cur.filter((x) => !ids.includes(x));
      await save("ignored_diffs", next);
      return { ok: true, count: next.length };
    }
    if (method === "POST" && p === "/api/overrides") {
      const item = overrideItem(body);
      await save("overrides", [...(await loadOverrides()), item]);
      return item;
    }
    // A calendar event edited on the Status page: replace it by these manual entries (all pieces of it).
    if (method === "POST" && p === "/api/overrides/replace") {
      const replaces = String(body.replaces || "");
      if (!replaces) throw new ApiError("which calendar event?");
      const items = (body.items || []).map((x) => overrideItem({ ...x, replaces }));
      if (!items.length) throw new ApiError("nothing to save");
      await save("overrides", [...(await loadOverrides()).filter((o) => o.replaces !== replaces || o.posted), ...items]);
      return items;
    }
    // "Don't fill": the calendar event is not proposed at all (undo with DELETE /api/overrides/<id>).
    if (method === "POST" && p === "/api/overrides/skip") {
      const replaces = String(body.replaces || "");
      if (!replaces || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) throw new ApiError("which calendar event?");
      const item = { id: crypto.randomUUID().slice(0, 10), date: body.date, replaces, skip: true, label: body.label || "" };
      await save("overrides", [...(await loadOverrides()).filter((o) => o.replaces !== replaces || o.posted), item]);
      return item;
    }
    if (method === "PATCH" && (m = /^\/api\/overrides\/(.+)$/.exec(p))) {
      const all = await loadOverrides();
      const cur = all.find((o) => o.id === m[1] && !o.skip);
      if (!cur) throw new ApiError("this manual entry no longer exists - reload the page");
      const next = { ...overrideItem({ ...cur, ...body }), id: cur.id };
      await save("overrides", all.map((o) => (o.id === cur.id ? next : o)));
      return next;
    }
    if (method === "DELETE" && (m = /^\/api\/overrides\/(.+)$/.exec(p))) {
      await save("overrides", (await loadOverrides()).filter((o) => o.id !== m[1]));
      return { ok: true };
    }
    throw new ApiError(`unknown request ${method} ${p}`);
  } catch (e) {
    throw new Error(e instanceof ApiError || e instanceof JiraError ? e.message : `Unexpected error: ${e.message}`);
  }
}
