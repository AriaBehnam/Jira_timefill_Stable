// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

import { handle, watchOutlookTabs } from "./backend.js";

const view = document.getElementById("view");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hrs = (m) => `${+((m || 0) / 60).toFixed(2)}h`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };

const api = (path, opts = {}) => handle(opts.method || "GET", path, opts.body || {});

let toastTimer;
function toast(msg, isErr = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), isErr ? 7000 : 3500);
}

// Every issue is shown as "<project name> – <phase>" with its key as small secondary text.
// Titles come from the stored projects and the plan (no extra Jira calls).
let issueLabels = {};
let titleToKey = {};
const issueTitle = (key) => issueLabels[key] || key;
const issueHtml = (key, link = "") => `<span class="it">${esc(issueTitle(key))}</span> ${link
  ? `<a class="ik" href="${esc(link)}" target="_blank">${esc(key)}</a>` : `<span class="ik">${esc(key)}</span>`}`;
/** Key from what was typed/picked: "title", "title · KEY", "KEY — title" or "KEY". */
function pickedKey(text) {
  const t = String(text || "").trim();
  if (titleToKey[t]) return titleToKey[t];
  const keys = t.toUpperCase().match(/(?<![A-Z0-9_])[A-Z][A-Z0-9_]*-\d+(?![\w-])/g);
  return keys ? keys[keys.length - 1] : "";
}
function learnTitles(map) {
  Object.assign(issueLabels, map || {});
  titleToKey = Object.fromEntries(Object.entries(issueLabels).map(([k, t]) => [t, k]));
}
async function loadIssueOptions() {
  try {
    const opts = await api("/api/issues");
    learnTitles(Object.fromEntries(opts.map((o) => [o.key, o.label])));
    issueChoices = opts; // also the all-day chooser's list
    // value = the title (what you search by); label = the key, shown small next to it by Chrome
    document.getElementById("issues-dl").innerHTML = opts.map((o) => `<option value="${esc(o.label)}" label="${esc(o.key)}">`).join("");
  } catch { /* not configured yet */ }
}

/* ------------------------------------------------------------------ projects */
// Project status = detected from the phase names (SDF, INIT, EXEC, COMM, ...) or Closed.
let PHASE_NAMES = { SDF: "Feasibility", INIT: "Pre-sale", EXEC: "Project", COMM: "Commissioning" }; // replaced by Settings → Phases
const statusName = (s) => (s === "closed" ? "Closed" : s === "open" ? "Open" : PHASE_NAMES[s] || s);
const rank = (s) => (s === "closed" ? 99 : s in PHASE_NAMES ? Object.keys(PHASE_NAMES).indexOf(s) : 50);
const statusOrder = (list) => [...list].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
let projFilter = "open";

/* Pages load data from Jira/Outlook, which takes a moment. If you switch page (or the page is drawn
   again) before the answer arrives, the older draw must not touch the page any more. */
let pageSeq = 0;
const currentView = () => { const n = (location.hash.match(/#\/(\w+)/) || [])[1]; return n && views[n] ? n : "status"; };
/** Start drawing page `name`: null if another page is shown, else a check that stays true while this draw is current. */
function startPage(name) {
  if (currentView() !== name) return null;
  const my = ++pageSeq;
  return () => my === pageSeq && currentView() === name;
}

async function renderProjects(autoRefresh = true) {
  const live = startPage("projects");
  if (!live) return;
  view.innerHTML = `<div class="loading">Loading projects…</div>`;
  let data;
  try { data = await api("/api/projects"); }
  catch (e) { if (live()) view.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; return; }
  if (!live()) return;

  if (data.phase_names) PHASE_NAMES = data.phase_names; // lifecycle order + names from Settings
  const stale = !data.last_refresh || data.needs_refresh || Date.now() - new Date(data.last_refresh).getTime() > 12 * 3600e3;
  if (autoRefresh && data.configured && stale) return refreshProjects(true);

  const all = data.projects.filter((p) => !p.internal); // external (customer) projects
  const internal = data.projects.filter((p) => p.internal).sort((a, b) => a.name.localeCompare(b.name));
  const counts = {};
  all.forEach((p) => (counts[p.status] = (counts[p.status] || 0) + 1));
  const statuses = statusOrder(Object.keys(counts));
  const total = all.reduce((a, p) => a + p.total_minutes, 0);
  if (!["open", "worked", "all"].includes(projFilter) && !counts[projFilter]) projFilter = "open";
  const shown = all
    .filter((p) => projFilter === "all" || (projFilter === "open" ? p.status !== "closed" : projFilter === "worked" ? p.worked_on : p.status === projFilter))
    .sort((a, b) => (a.status === "closed") - (b.status === "closed") || (b.is_new - a.is_new) || a.name.localeCompare(b.name));
  const browse = (k) => esc(`${data.jira_url}/browse/${encodeURIComponent(k)}`);
  const since = data.track_from ? `since ${new Date(data.track_from + "T00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "all time";
  const rep = data.last_report;
  const closedWorked = all.filter((p) => p.worked_on && p.status === "closed").length;
  const reportHtml = !rep ? "" : `
    ${rep.errors.map((e) => `<div class="banner err">${esc(e)}</div>`).join("")}
    <div class="small muted report">Last check: <b>${rep.assigned}</b> issues from the projects query ·
      ${rep.worked_jql
        ? `<b>${rep.worked}</b> issues you logged time on ${esc(since)}${rep.worked ? "" : ` — <span class="warn">none found; check “Also add issues I worked on” and “Track from” in <a href="#/settings">Settings</a></span>`}`
        : `the “issues I worked on” search is switched off in <a href="#/settings">Settings</a>`} ·
      <b>${rep.epics ?? 0}</b> epics, <b>${rep.groups ?? 0}</b> code groups, <b>${rep.related}</b> more phases found${rep.merged ? ` · <b>${rep.merged}</b> epic${rep.merged > 1 ? "s" : ""} merged into a later epic with the same code` : ""}${internal.length ? ` · <a href="#internal">${internal.length} internal project${internal.length > 1 ? "s" : ""}</a> below` : ""}
      ${rep.worked_jql ? `<details><summary>query used</summary><code>${esc(rep.worked_jql)}</code>${rep.worked_keys.length ? `<div>${rep.worked_keys.map(esc).join(", ")}</div>` : ""}</details>` : ""}
      ${closedWorked && projFilter === "open" ? `<div class="warn">${closedWorked} project${closedWorked > 1 ? "s" : ""} you worked on ${closedWorked > 1 ? "are" : "is"} closed in Jira and hidden here — see “Worked on”.</div>` : ""}
    </div>`;
  const VIA_TEXT = { worked: "you logged time here (not assigned to you)", related: "phase of one of your projects", kept: "kept because you configured this project" };

  // Phases = the real phase labels from Jira ("INIT · MGMT", "SDF · SD"). The project status
  // (detected from these names) is shown only in the Status column.
  const phaseList = (p) => `<div class="phases">${p.phases.map((i) => `
      <a class="ph ${i.current ? "cur" : ""} ${i.done ? "done" : ""}" href="${browse(i.key)}" target="_blank"
         title="${esc(`${i.key} · ${i.summary} · ${i.status}${i.current ? " · calendar events go here now" : ""}${VIA_TEXT[i.via] ? " · " + VIA_TEXT[i.via] : ""}`)}">
        <span>${esc(i.label)}</span><i class="ik">${esc(i.key)}</i><b>${hrs(i.my_minutes)}</b></a>`).join("") || `<span class="muted small">no phases</span>`}</div>`;
  const epicLink = (e) => `<a href="${browse(e.key)}" target="_blank" title="${esc(e.summary || "")}">${esc(e.key)}</a>`;
  const projectRef = (p) => p.kind === "epic"
    ? `epic ${epicLink(p.epic)}${(p.merged_epics || []).map((e) => ` + ${epicLink(e)}`).join("")}${p.code ? ` · ${esc(p.code)}` : ""}`
    : p.kind === "group" ? `code ${esc(p.code)} · ${p.issues.length} issue${p.issues.length > 1 ? "s" : ""}`
    : epicLink(p.issues[0]);
  const statusOptions = (p) =>
    `<option value="auto" ${p.status_mode === "auto" ? "selected" : ""}>Auto (${esc(statusName(p.auto_status))})</option>` +
    p.allowed_statuses.map((o) => `<option value="${esc(o)}" ${p.status_mode === o ? "selected" : ""}>${esc(statusName(o))}</option>`).join("");
  const row = (p) => `
    <tr class="${p.status === "closed" ? "closed" : ""}">
      <td class="pname">
        <div class="nm">${esc(p.name)}${p.is_new ? `<span class="badge">NEW</span>` : ""}${p.via === "worked" ? `<span class="badge via" title="${VIA_TEXT.worked}">WORKED ON</span>` : ""}${p.pinned ? `<span class="badge via" title="added by you with “Find a project”">ADDED</span> <button class="btn tiny" data-unpin="${esc(p.id)}" title="remove from my list">Remove</button>` : ""}</div>
        <div class="small muted">${projectRef(p)}</div>
        ${typeSelect(p)}
      </td>
      <td><select class="status" data-id="${esc(p.id)}">${statusOptions(p)}</select></td>
      <td><input class="kw" data-id="${esc(p.id)}" value="${esc((p.keywords || []).join(", "))}" placeholder="${p.status === "closed" ? "" : "add calendar keywords…"}">
          ${!p.keywords?.length && p.status !== "closed" ? `<div class="small" style="color:var(--accent)">no keywords → never matched</div>` : ""}</td>
      <td>${phaseList(p)}</td>
      <td class="num">${hrs(p.total_minutes)}</td>
    </tr>`;

  view.innerHTML = `
    ${!data.configured ? `<div class="banner">Jira is not configured yet — open <a href="#/settings">Settings</a> first.</div>` : ""}
    <div class="bar-row">
      <h1>Projects</h1><span class="grow"></span>
      <span class="small muted">${data.last_refresh ? `last check ${esc(data.last_refresh.replace("T", " "))}` : "never checked"}</span>
      <button class="btn accent" id="refresh" ${data.configured ? "" : "disabled"}>↻ Detect new projects</button>
    </div>
    <div class="stats">
      ${statuses.map((s) => `<div class="card stat"><b>${counts[s]}</b><span>${esc(statusName(s))}</span></div>`).join("")}
      <div class="card stat"><b>${hrs(total)}</b><span>your hours ${esc(since)}</span></div>
    </div>
    ${reportHtml}
    <div class="card find">
      <div class="find-row"><b>Find a project in Jira</b>
        <input id="find-q" placeholder="name, code or Jira key, e.g. echo, 26.006 or PRJ-226" value="${esc(lastFind)}" ${data.configured ? "" : "disabled"}>
        <button class="btn" id="find-go" ${data.configured ? "" : "disabled"}>Search</button>
        <span class="small muted">any status, not only your issues — add it to put hours on it</span></div>
      <div id="find-res"></div>
    </div>
    <div class="bar-row">
      <div class="filters">
        ${[["open", "Open"], ...statuses.map((s) => [s, statusName(s)]), ["worked", "Worked on"], ["all", "All"]]
          .map(([k, l]) => `<button class="chip ${projFilter === k ? "on" : ""}" data-filter="${esc(k)}">${esc(l)}</button>`).join("")}
      </div>
      <span class="grow"></span>
      <span class="small muted">Calendar title = keyword + <b>E</b> (engineering/SD) or <b>M</b> (management) — e.g. “Alpha E layout review”. A keyword with several words (“echo plc”) needs all of them in the title; commas separate keywords.</span>
    </div>
    <div class="card">
      <table class="projects">
        <colgroup><col style="width:22%"><col style="width:170px"><col style="width:210px"><col><col style="width:90px"></colgroup>
        <thead><tr><th>Project</th><th>Status</th><th>Calendar keywords</th>
          <th>Phases <span class="small muted nocaps">· highlighted = where events go now</span></th><th class="num">Hours<div class="small muted nocaps">${esc(since)}</div></th></tr></thead>
        <tbody>${shown.map(row).join("") || `<tr><td colspan="5" class="loading">No projects here yet${data.configured ? " — press “Detect new projects”." : "."}</td></tr>`}</tbody>
      </table>
    </div>
    ${internalSection(internal, browse)}`;
}

// External = customer project (keyword + E/M -> phase). Internal = company work, keywords per issue.
const typeSelect = (p) => `<select class="ptype" data-id="${esc(p.id)}" title="External = customer project, Internal = company-internal work">
    <option value="auto" ${p.type_mode === "auto" ? "selected" : ""}>Auto (${p.auto_internal ? "Internal" : "External"})</option>
    <option value="external" ${p.type_mode === "external" ? "selected" : ""}>External</option>
    <option value="internal" ${p.type_mode === "internal" ? "selected" : ""}>Internal</option></select>`;

/* Internal projects (no project code, or set to Internal): each issue gets its own calendar keywords. */
function internalSection(list, browse) {
  return `
    <div class="bar-row" id="internal" style="margin-top:28px"><h2>Internal projects</h2><span class="grow"></span>
      <span class="small muted">Company-internal work. Give an issue calendar keywords: events with that word go to that issue (no E/M needed).</span></div>
    <div class="card">
      <table class="projects internal">
        <colgroup><col style="width:20%"><col style="width:100px"><col><col style="width:80px"><col style="width:140px"><col style="width:26%"></colgroup>
        <thead><tr><th>Project</th><th colspan="2">Issue</th><th class="num">Hours</th><th title="where its hours count on the Charts page (Time by type of work)">Chart</th><th>Calendar keywords</th></tr></thead>
        <tbody>${list.map((p) => p.phases.map((i, n) => `
          <tr class="${i.done ? "closed" : ""} ${n ? "cont" : ""}">
            ${n ? "" : `<td class="pname" rowspan="${p.phases.length}">
              <div class="nm">${esc(p.name)}${p.is_new ? `<span class="badge">NEW</span>` : ""}</div>
              <div class="small muted">${p.epic ? `epic <a href="${browse(p.epic.key)}" target="_blank">${esc(p.epic.key)}</a> · ` : ""}${hrs(p.total_minutes)}</div>
              ${typeSelect(p)}</td>`}
            <td colspan="2"><span class="it">${esc(i.label && i.label !== "main" ? i.label : i.summary)}</span> <a class="ik" href="${browse(i.key)}" target="_blank">${esc(i.key)}</a>
              <div class="small muted">${esc(i.status)}</div></td>
            <td class="num">${hrs(i.my_minutes)}</td>
            <td><select class="gtype" data-id="${esc(p.id)}" data-key="${esc(i.key)}" title="where its hours count on the Charts page">
              ${[["internal", "Internal"], ["training", "Training"], ["vacation", "Vacation / absence"], ["general", "General"], ["presale", "Pre-sale"], ["project", "Project"], ["install", "Installation"]].map(([v, l]) =>
                `<option value="${v}" ${(i.work_type || "internal") === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
            <td><input class="gkw" data-id="${esc(p.id)}" data-key="${esc(i.key)}" value="${esc(i.keywords.join(", "))}" placeholder="calendar keywords…"></td>
          </tr>`).join("")).join("") || `<tr><td colspan="6" class="loading">No internal projects yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

let lastFind = "";
async function findInJira() {
  const q = document.getElementById("find-q")?.value.trim() || "";
  const box = document.getElementById("find-res");
  lastFind = q;
  if (q.length < 2) { box.innerHTML = `<div class="small muted">Type at least 2 letters.</div>`; return; }
  box.innerHTML = `<div class="small muted">Searching Jira…</div>`;
  try {
    const res = await api(`/api/jira/find?q=${encodeURIComponent(q)}`);
    const jiraUrl = (await api("/api/settings")).jira_url.replace(/\/+$/, "");
    box.innerHTML = res.length ? `<table class="find-res">${res.map((r) => `
      <tr><td><b>${esc(r.name)}</b></td>
        <td class="small muted">${r.kind === "epic" ? "epic" : "issue"} <a class="ik" href="${esc(`${jiraUrl}/browse/${encodeURIComponent(r.key)}`)}" target="_blank">${esc(r.key)}</a></td>
        <td class="small muted">${esc(r.status)}</td>
        <td class="num">${r.in_list ? `<span class="small muted">in your list</span>` : `<button class="btn tiny primary" data-pin="${esc(r.key)}">Add to my list</button>`}</td></tr>`).join("")}</table>`
      : `<div class="small muted">Nothing found for “${esc(q)}”.</div>`;
  } catch (e) { box.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; }
}
async function pinProject(btn, key) {
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    const r = await api("/api/projects/pin", { method: "POST", body: { key } });
    toast(r.added.length ? `Added: ${r.added.join(", ")}` : "Added to your list");
    loadIssueOptions();
  } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = "Add to my list"; return; }
  await renderProjects(false);
  if (lastFind) findInJira();
}
async function unpinProject(id) {
  try { const r = await api(`/api/projects/${encodeURIComponent(id)}/pin`, { method: "DELETE" }); toast(r.removed ? "Removed from your list" : "No longer pinned (it stays: it's assigned to you or you logged time on it)"); loadIssueOptions(); }
  catch (e) { toast(e.message, true); }
  renderProjects(false);
}

async function refreshProjects(silent = false) {
  if (currentView() !== "projects") return;
  const b = document.getElementById("refresh");
  if (b) { b.disabled = true; b.textContent = "Checking Jira…"; } else view.innerHTML = `<div class="loading">Checking Jira for new projects…</div>`;
  try {
    const r = await api("/api/projects/refresh", { method: "POST" });
    const found = r.report ? ` (${r.report.assigned} assigned, ${r.report.worked} worked on)` : "";
    if (r.report?.errors?.length) toast(r.report.errors[0], true);
    else if (r.added.length) toast(`New: ${r.added.join(", ")}`);
    else if (!silent) toast(`No new projects${found} — statuses and hours updated`);
    loadIssueOptions();
  } catch (e) { toast(e.message, true); }
  renderProjects(false);
}

async function patchProject(id, body) {
  try { await api(`/api/projects/${encodeURIComponent(id)}`, { method: "PATCH", body }); toast("Saved"); loadIssueOptions(); renderProjects(false); }
  catch (e) { toast(e.message, true); }
}

/* -------------------------------------------------------------------- status */
let weekStart = mondayOf(new Date());
const PX_PER_HOUR = 116; // a 30-minute block shows its three lines (title, project, time) in full
let grid = { lo: 7 * 60, hi: 20 * 60, editable: false }; // hours shown on the week calendar (set by weekGrid)
const yOf = (m) => ((Math.min(grid.hi, Math.max(grid.lo, m)) - grid.lo) / 60) * PX_PER_HOUR;
const KIND_TEXT = { logged: "already logged", planned: "to fill", vacation: "vacation", missing: "missing", lunch: "lunch" };

/* Show on the calendar: "both", only "jira" (worklogs already in Jira), only "outlook" (your calendar: blocks to
   fill, vacation, events without a project). Remembered in this browser. Orange differences show in every view. */
let calView = (() => { try { return localStorage.getItem("timefill_cal_view") || "both"; } catch { return "both"; } })();
const VIEW_KEEP = {
  both: () => true,
  jira: (s) => s.kind === "logged" || s.kind === "missing" || s.kind === "lunch",
  outlook: (s) => s.kind !== "logged" || !!s.diff,
};

function weekGrid(plan) {
  // every list a day may have, so a day from an older version (or a half-built one) can't break the page
  const keep = VIEW_KEEP[calView] || VIEW_KEEP.both;
  const days = (plan.days || []).map((d) => ({ segments: [], unmatched: [], ignored: [], dismissed: [], candidates: [], entries: [], ...d }))
    .map((d) => ({ ...d, segments: d.segments.filter(keep),
      unmatched: calView === "jira" ? [] : d.unmatched, dismissed: calView === "jira" ? [] : d.dismissed }));
  const broken = [];
  /** Draw one part of one day; if it fails, log it and draw a placeholder instead of losing the whole page. */
  const safe = (d, part, fn, fallback) => {
    try { return fn(); } catch (e) {
      console.error(`[Timefill] could not draw the ${part} of ${d.date}:`, e, d);
      if (!broken.some((b) => b.startsWith(d.date))) broken.push(`${d.date}: ${e.message}`);
      return typeof fallback === "function" ? fallback(e) : fallback;
    }
  };
  const allSegs = days.flatMap((d) => d.segments.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end)));
  // Show 07–20 at least, grow to fit early/late work, but never beyond 05–23 (Jira worklogs at odd hours are clipped to the edge).
  const lo = Math.max(5 * 60, Math.floor(Math.min(7 * 60, ...allSegs.map((s) => s.start)) / 60) * 60);
  const hi = Math.min(23 * 60, Math.ceil(Math.max(20 * 60, ...allSegs.map((s) => s.end)) / 60) * 60);
  grid = { lo, hi, editable: !!plan.jira_ok };
  const y = yOf;
  const height = y(hi);
  const today = iso(new Date());
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const stateText = { complete: "complete", ready: "ready to fill", gaps: "missing hours", upcoming: "upcoming", off: "day off", untracked: "not tracked", leave: "on leave" };
  const head = days.map((d) => safe(d, "header", () => {
    const dt = new Date(d.date + "T00:00");
    const label = dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
    const postable = d.entries.filter((e) => !e.future).length;
    return `
      <div class="cal-dh ${d.date === today ? "today" : ""}">
        <div class="cal-dt"><b>${esc(label)}</b><span class="state state-${d.state}">${stateText[d.state]}</span></div>
        ${d.working && !d.calendar_read ? `<div class="small warn" title="This day has not been read from Outlook yet">⚠ calendar not read</div>` : d.read_at ? `<div class="small muted" title="last read from Outlook">read ${esc(d.read_at.slice(5).replace("T", " "))}</div>` : ""}
        <div class="cal-nums">${d.working
          ? `<span title="already in Jira" style="color:var(--logged)">${hrs(d.logged)}</span> · <span title="to fill" style="color:var(--planned)">${hrs(d.planned)}</span> · <span title="missing" style="color:var(--missing)">${hrs(d.missing)}</span> / ${hrs(d.target)}`
          : d.logged || d.planned ? `${d.logged ? `<span style="color:var(--logged)">in Jira ${hrs(d.logged)}</span>` : ""}${d.logged && d.planned ? " · " : ""}${d.planned ? `<span style="color:var(--planned)">to fill ${hrs(d.planned)}</span>` : ""}` : "&nbsp;"}</div>
        ${d.entries.length ? `<button class="btn tiny" data-fill-day="${d.date}">Review day (${d.entries.length})</button>` : ""}
      </div>`;
  }, `<div class="cal-dh"><b>${esc(d.date)}</b><div class="small warn">could not be drawn</div></div>`)).join("");

  const allDay = days.map((d) => safe(d, "all-day row", () => {
    const cands = d.candidates.map((x) => `<button class="ad-cand ${x.on ? "on" : ""} ${x.on && !x.issue ? "warn" : ""}" data-allday="${d.date}"
        title="${esc(`${x.subject} · ${x.show_as}${x.on ? ` · ${hrs(x.minutes)}` : " · not filled"} — click to choose what to fill this day`)}">${x.posted ? "✓" : x.edited ? "✎" : x.on ? "☑" : "☐"} ${esc(x.subject)}${x.on ? ` · ${hrs(x.minutes)}` : ""}</button>`).join("");
    const chips = d.ignored.filter((u) => u.all_day)
      .map((u) => `<span class="ad-chip" title="${esc(u.reason)}">${esc(u.subject)}</span>`).join("")
      + d.dismissed.filter((u) => u.all_day).map((u) => `<span class="ad-chip off" title="not filled (your choice)">${esc(u.subject)}
          <button class="x" data-del-override="${esc(u.override_id)}" title="fill it again">↺</button></span>`).join("");
    return `<div class="cal-ad ${d.date === today ? "today" : ""}">${cands}${chips}</div>`;
  }, `<div class="cal-ad"></div>`)).join("");

  const block = (d, s) => {
    // 1px gap above and 2px below each block, so blocks that follow each other are clearly separate
    const top = y(s.start) + 1, h = Math.max(y(s.end) - y(s.start) - 3, 12);
    const mins = s.end - s.start;
    const time = `${fmtHM(s.start)}–${fmtHM(s.end)}`;
    // blocks at the same time sit side by side, like in the calendar
    const style = `top:${top}px;height:${h}px;${laneCss(s)}`;
    if (s.kind === "lunch") return `<div class="blk lunch" style="top:${top}px;height:${h}px"><span>lunch</span></div>`;
    if (s.kind === "missing") {
      const pick = esc(JSON.stringify({ date: d.date, start: fmtHM(s.start), end: fmtHM(s.end), label: "" }));
      const slot = esc(JSON.stringify({ date: d.date, start: s.start, end: s.end }));
      return `<div class="blk missing ${s.future ? "future" : ""}" style="${style}" data-pick='${pick}' data-slot='${slot}' title="${time} missing — click to assign all of it, or drag over it to choose a part (15-minute steps)">
        <b>${hrs(mins)}</b> missing<div class="bt">${time}</div></div>`;
    }
    if (s.kind === "diff") // a calendar event that Jira doesn't have at that time
      return `<div class="blk diff-ev" style="${style}" data-diff="${esc(s.diff)}" title="${esc(`${s.label} ${time} — not like Jira. Click for details.`)}">
        <div class="bh"><span class="bn">${esc(s.label)}</span></div><div class="bp">not in Jira at this time</div><div class="bt"><span class="tm">${time}</span></div></div>`;
    const manual = s.source === "manual";
    // Worklogs already in Jira can be moved (drag) or resized (drag the top or bottom edge); Jira changes only after you confirm.
    const movable = s.kind === "logged" && s.worklog_id && grid.editable;
    const wl = movable ? ` data-wl='${esc(JSON.stringify({ issue: s.issue, id: s.worklog_id, date: d.date, start: s.start, end: s.end }))}'` : "";
    // "To fill" blocks: drag / resize / click to change. Local only — Jira is written after approval.
    // "to fill" and vacation blocks: click to change, drag to move, drag an edge to resize (Jira only after approval)
    const editable = (s.kind === "planned" && (s.source === "calendar" || s.source === "manual" || s.source === "all_day"))
      || (s.kind === "vacation" && s.source === "vacation" && !!s.event_key);
    const pl = editable ? ` data-pl='${esc(JSON.stringify({ date: d.date, start: s.start, end: s.end, issue: s.issue, label: s.label || "", source: s.source, override_id: s.override_id, event_key: s.event_key }))}'` : "";
    const handles = movable || editable ? (h >= 26 ? `<i class="rs rs-top"></i><i class="rs rs-bot"></i>` : `<i class="rs rs-bot"></i>`) : "";
    const hint = movable ? " · drag to move, drag the top or bottom edge to change the length"
      : editable ? " · click to change the issue or time, drag to move, drag an edge to change the length" : "";
    const diff = s.diff ? ` data-diff="${esc(s.diff)}"` : "";
    return `<div class="blk ${s.kind} ${s.diff ? "diff-wl" : ""} ${s.future ? "future" : ""} ${movable ? "movable" : ""} ${editable ? "editable" : ""}" style="${style}"${wl}${pl}${diff} title="${s.diff ? "not like your calendar, click for details · " : ""}${esc(`${KIND_TEXT[s.kind]} · ${issueTitle(s.issue)} (${s.issue}) · ${time}${s.label ? " · " + s.label : ""}${manual ? " · changed by you" : ""}${hint}`)}">${handles}
      <div class="bh"><span class="bn">${esc(s.label || issueTitle(s.issue))}</span>${manual ? `<button class="x" data-del-override="${esc(s.override_id)}" title="${s.event_key ? "undo your change (back to the calendar)" : "remove manual assignment"}">×</button>` : ""}</div>
      <div class="bp">${s.label ? `${esc(issueTitle(s.issue))} ` : ""}<span class="ik">${esc(s.issue)}</span></div>
      <div class="bt"><span class="tm">${time}</span> · <b class="hm">${hrs(mins)}</b>${s.kind !== "logged" ? ` · ${KIND_TEXT[s.kind]}` : ""}</div></div>`;
  };
  // calendar events you marked "Don't fill": a thin marker you can undo
  const dismissedBlock = (d, u) => {
    if (u.all_day) return "";
    const top = y(u.s) + 1, h = Math.max(y(u.e) - y(u.s) - 3, 12);
    return `<div class="blk dismissed" style="top:${top}px;height:${h}px;${laneCss(u)}" title="${esc(`${u.subject} ${u.start}–${u.end} — not filled (your choice)`)}">
      <div class="bl">${esc(u.subject)}</div><button class="x" data-del-override="${esc(u.override_id)}" title="fill it again">↺</button></div>`;
  };
  const unmatchedBlock = (d, u) => {
    if (u.all_day) return "";
    const top = y(u.s) + 1, h = Math.max(y(u.e) - y(u.s) - 3, 12);
    const pick = esc(JSON.stringify({ date: d.date, start: u.start, end: u.end, label: u.subject, replaces: u.key || undefined }));
    return `<div class="blk unmatched" style="top:${top}px;height:${h}px;${laneCss(u)}" data-pick='${pick}' title="${esc(`${u.subject} — ${u.reason}. Click to assign.`)}">
      <div class="bl"><b>${esc(u.subject)}</b></div><div class="bt">${esc(u.reason)}</div></div>`;
  };

  // Things at the same time sit next to each other, like in Outlook; a day with more of them gets a wider column.
  const lanesOf = days.map((d) => safe(d, "layout", () => assignLanes([
    ...d.segments.filter((s) => s.kind !== "lunch").map((s) => ({ ref: s, start: s.start, end: s.end })),
    ...d.unmatched.filter((u) => !u.all_day).map((u) => ({ ref: u, start: u.s, end: u.e })),
    ...d.dismissed.filter((u) => !u.all_day).map((u) => ({ ref: u, start: u.s, end: u.e })),
  ]), 1));
  const colTemplate = `52px ${lanesOf.map((n) => `minmax(${150 + 110 * (n - 1)}px, ${1 + 0.75 * (n - 1)}fr)`).join(" ")}`;
  // each block on its own too: one odd worklog or event is left out (and logged), the rest of the day is drawn
  const each = (d, list, fn, what) => list.map((x) => safe(d, what, () => fn(d, x), "")).join("");
  const cols = days.map((d) => `
    <div class="cal-col ${d.date === today ? "today" : ""} ${d.working ? "" : "off"}" data-date="${d.date}" style="height:${height}px">
      ${each(d, d.segments, block, "blocks")}
      ${each(d, d.unmatched, unmatchedBlock, "events without a project")}
      ${each(d, d.dismissed, dismissedBlock, "events you don't fill")}
      <div class="hour-lines" aria-hidden="true"></div>
      ${d.date === today && nowMin > lo && nowMin < hi ? `<div class="now" style="top:${y(nowMin)}px"></div>` : ""}
    </div>`).join("");

  let gutter = "";
  for (let m = lo; m < hi; m += 60) gutter += `<div class="hr" style="top:${y(m)}px">${m / 60}:00</div>`;

  return `
    ${broken.length ? `<div class="banner err">Part of this week could not be drawn (${esc(broken.join("; "))}). The rest is shown; details are in the console (F12).</div>` : ""}
    <div class="cal-wrap card" id="cal-scroll">
      <div class="cal-sticky">
        <div class="cal" style="--cols:${days.length};--hour:${PX_PER_HOUR}px;grid-template-columns:${colTemplate}">
          <div class="cal-corner"></div>${head}
          <div class="cal-g small muted">all-day</div>${allDay}
        </div>
      </div>
      <div class="cal" style="--cols:${days.length};--hour:${PX_PER_HOUR}px;grid-template-columns:${colTemplate}">
        <div class="cal-g" style="height:${height}px">${gutter}</div>${cols}
      </div>
    </div>`;
}

/** Overlapping blocks of a day get a lane each (lane / lanes), so they can be drawn side by side. */
/** Where a block sits across its day column: its lane of lanes, with a small gap on each side. */
const laneCss = (o) => {
  const n = o.lanes || 1, i = o.lane || 0;
  // each lane has 2px on both sides, plus 4px at the column edges: the same space left and right (centred)
  return `left:calc(6px + (100% - 8px) * ${i} / ${n});right:auto;width:calc((100% - 8px) / ${n} - 4px)`;
};
/** Items {ref, start, end} at overlapping times get a lane each; ref.lane / ref.lanes are set. Returns the most lanes used. */
function assignLanes(items) {
  const list = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [], ends = [], groupEnd = -1, most = 1;
  const close = () => { for (const s of group) s.ref.lanes = ends.length; most = Math.max(most, ends.length); group = []; ends = []; };
  for (const s of list) {
    if (s.start >= groupEnd) { close(); groupEnd = -1; }
    let lane = ends.findIndex((e) => e <= s.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = s.end;
    s.ref.lane = lane;
    group.push(s);
    groupEnd = Math.max(groupEnd, s.end);
  }
  close();
  return most;
}

const fmtHM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/* fresh = read Outlook + Jira again (opening this page, ↻ Refresh). Otherwise the page is redrawn from what
   was already read: instant, keeps your scroll position. */
async function renderStatus(fresh = false) {
  const live = startPage("status");
  if (!live) return;
  const pop = document.getElementById("pop");
  pop.style.display = "none";
  delete pop.dataset.mode;
  const to = addDays(weekStart, 4);
  const rangeLabel = `${weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${to.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  const scrollY = window.scrollY || 0;
  const calScroll = document.getElementById("cal-scroll")?.scrollTop ?? null;
  const sameWeek = lastPlan && lastPlan.from === iso(weekStart) && document.getElementById("status-body");
  const header = `
    <div class="bar-row">
      <h1>Status</h1>
      <button class="btn" data-week="-1">‹</button><button class="btn" data-week="0">This week</button><button class="btn" data-week="1">›</button>
      <span class="muted">${rangeLabel}</span>
      <span class="grow"></span>
      <button class="btn" id="open-outlook" title="Opens this week in Outlook web in a new tab">Open week in Outlook</button>
      <button class="btn" id="refresh-status" title="Read your Outlook tab and Jira again">↻ Refresh</button>
      <button class="btn diff-btn" id="diff-week" hidden>Differences</button>
      <button class="btn primary" id="fill-week" disabled>Review &amp; approve</button>
    </div>`;
  // only show "Reading…" when something is actually read; a local redraw replaces the page in one go
  if (fresh || !sameWeek) view.innerHTML = `${header}<div id="status-body"><div class="loading">${fresh ? "Reading calendar and Jira…" : "Loading…"}</div></div>`;
  let plan;
  try { plan = await api(`/api/plan?from=${iso(weekStart)}&to=${iso(to)}${fresh ? "&fresh=1" : ""}`); }
  catch (e) {
    const body = live() && document.getElementById("status-body");
    if (body) body.innerHTML = `<div class="banner err">${esc(e.message)}</div>`;
    return;
  }
  // you went to another page or week, or the page was redrawn meanwhile: this answer is outdated
  if (!live()) return;
  if (!(fresh || !sameWeek)) view.innerHTML = `${header}<div id="status-body"></div>`;
  if (!document.getElementById("fill-week") || !document.getElementById("status-body")) return;
  try { drawStatus(plan, fresh, sameWeek, scrollY, calScroll); }
  catch (e) {
    console.error("[Timefill] the Status page could not be drawn:", e, plan);
    const body = document.getElementById("status-body");
    if (body) body.innerHTML = `<div class="banner err">The Status page could not be drawn: ${esc(e.message)}. Details are in the console (F12). Press ↻ Refresh to try again.</div>`;
  }
}

function drawStatus(plan, fresh, sameWeek, scrollY, calScroll = null) {
  lastPlan = plan;
  learnTitles(plan.titles);
  const t = plan.totals;
  const fillBtn = document.getElementById("fill-week");
  const nEntries = plan.days.reduce((a, d) => a + d.entries.length, 0);
  fillBtn.disabled = !plan.jira_ok || !nEntries;
  fillBtn.textContent = nEntries ? `Review & approve · ${nEntries} worklogs` : "Nothing to fill";
  const nDiffs = plan.days.reduce((a, d) => a + (d.diffs || []).length, 0);
  const nIgnored = weekDiffIds().length;
  const diffBtn = document.getElementById("diff-week");
  diffBtn.hidden = !nDiffs && !nIgnored;
  diffBtn.classList.toggle("on", nDiffs > 0);
  diffBtn.textContent = nDiffs ? `⚠ ${nDiffs} not like calendar` : `${nIgnored} ignored`;
  diffBtn.title = nDiffs ? "Worklogs in Jira and events in your calendar that don't match. Click to see the list and ignore them."
    : "Differences you ignored this week. Click to show them again.";
  document.getElementById("status-body").innerHTML = `
    ${plan.warnings.map((w) => `<div class="banner err">${esc(w)}</div>`).join("")}
    <div class="bar-row">
      <div class="totals">
        <span>expected <b>${hrs(t.target)}</b></span>
        <span style="color:var(--logged)">already logged <b>${hrs(t.logged)}</b></span>
        <span style="color:var(--planned)">to fill <b>${hrs(t.planned)}</b></span>
        <span style="color:var(--missing)">missing so far <b>${hrs(t.missing_past)}</b></span>
        <span class="muted">${plan.event_count} calendar events · ${plan.outlook_tabs ? `${plan.outlook_tabs} Outlook tab open` : "no Outlook tab open"}${plan.jira_read_at ? ` · Jira read ${esc(new Date(plan.jira_read_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))}` : ""}</span>
      </div>
      <span class="grow"></span>
      <div class="seg" role="group" aria-label="show">${[["both", "Both"], ["jira", "Jira"], ["outlook", "Outlook"]].map(([k, l]) =>
        `<button class="chip ${calView === k ? "on" : ""}" data-calview="${k}" title="${k === "both" ? "Jira worklogs and your calendar" : k === "jira" ? "only what is already in Jira (and missing time)" : "only your calendar: blocks to fill, vacation, events without a project"}">${l}</button>`).join("")}</div>
      <div class="legend">
        <span><i style="background:var(--logged)"></i>already logged</span><span><i style="background:var(--planned)"></i>to fill</span>
        <span><i style="background:var(--vacation)"></i>vacation</span><span><i class="lg-missing"></i>missing</span>
        <span><i class="lg-unmatched"></i>not matched</span><span><i class="lg-diff"></i>Jira ≠ calendar</span>
      </div>
    </div>
    ${weekGrid(plan)}
    <p class="small muted">Click a <b>missing</b> or <b>not matched</b> block to assign it; <b>drag over a missing block</b> to assign only part of it (15-minute steps). Nothing is written to Jira until you approve each worklog in “Review &amp; approve”. Faded blocks are later than now.<br>
      Blue <b>to fill</b> blocks: click to change the issue or time (or “Don't fill”), drag to move them, drag the top or bottom edge to change the length. × undoes your change.<br>
      Drag a green <b>in Jira</b> block to another time or day, or drag its top or bottom edge to change its length (15-minute steps; hold Alt for 5). Timefill asks before it changes the worklog in Jira.<br>
      <b style="color:#c2620c">Orange</b>: Jira and your calendar don't match (a worklog with no event at that time, or an event of your projects that isn't in Jira). Click it to see both sides and ignore it, or use the “not like calendar” button for the whole week. Events at the same time are shown side by side, each in full: drag or resize them to split the time.</p>`;
  if (!fresh && sameWeek) { // a local redraw keeps your place
    window.scrollTo(0, scrollY);
    const box = document.getElementById("cal-scroll");
    if (box && calScroll !== null) box.scrollTop = calScroll;
  }
}

/* Project -> Phase picker, used by every "which issue" box. The phase is detected for the event
   (E/M in the title + the project's status) and preselected; you can pick another. */
let pickData = null;
function placePop(target, wide = false) {
  const pop = document.getElementById("pop");
  pop.classList.toggle("wide", wide); // only the all-day chooser is wide
  const r = target.getBoundingClientRect();
  pop.style.display = "block";
  const left = Math.min(r.right + 8, window.innerWidth - pop.offsetWidth - 12);
  const x = left < r.right ? Math.max(12, r.left - pop.offsetWidth - 8) : left;
  const y = Math.max(12, Math.min(r.top, window.innerHeight - pop.offsetHeight - 12));
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  // the box stays next to its block: when the page or the calendar scrolls, it moves with the block
  popAnchor = { el: target, dx: x - r.left, dy: y - r.top };
}
let popAnchor = null;
function followAnchor() {
  const pop = document.getElementById("pop");
  if (!popAnchor || pop.style.display !== "block" || !popAnchor.el.isConnected) return;
  const r = popAnchor.el.getBoundingClientRect();
  pop.style.left = `${r.left + popAnchor.dx}px`;
  pop.style.top = `${r.top + popAnchor.dy}px`;
}
// capture: also the calendar's own scrolling (it scrolls inside its box, not the page)
document.addEventListener("scroll", followAnchor, { capture: true, passive: true });
async function mountPicker(label, current, target) {
  const box = document.getElementById("pk");
  box.innerHTML = `<div class="small muted">Loading projects…</div>`;
  try { pickData = await api(`/api/pick?label=${encodeURIComponent(label || "")}&current=${encodeURIComponent(current || "")}`); }
  catch (e) { box.innerHTML = `<div class="warn small">${esc(e.message)}</div>`; return; }
  const sel = pickData.projects.find((x) => x.id === pickData.selected);
  box.innerHTML = `
    <label class="small muted">Project</label>
    <input id="pk-proj" list="pk-proj-dl" placeholder="Type a project name…" value="${esc(sel?.name || "")}" autocomplete="off">
    <datalist id="pk-proj-dl">${pickData.projects.map((x) => `<option value="${esc(x.name)}" label="${esc(x.internal ? "internal" : x.status)}">`).join("")}</datalist>
    <label class="small muted">Phase <span class="nocaps">· ★ detected for this event</span></label>
    <select id="pk-phase"></select>
    <div class="ik" id="pk-key"></div>`;
  fillPhases(sel);
  if (target) placePop(target);
  const inp = document.getElementById("pk-proj");
  if (!sel) inp.focus(); else document.getElementById("pk-phase").focus();
}
function pickedProject() {
  const v = (document.getElementById("pk-proj")?.value || "").trim().toLowerCase();
  if (!v || !pickData) return null;
  const list = pickData.projects;
  return list.find((x) => x.name.toLowerCase() === v) || (list.filter((x) => x.name.toLowerCase().includes(v)).length === 1 ? list.find((x) => x.name.toLowerCase().includes(v)) : null);
}
function fillPhases(proj) {
  const sel = document.getElementById("pk-phase");
  if (!sel) return;
  if (!proj) { sel.innerHTML = `<option value="">— pick a project first —</option>`; sel.disabled = true; showPickedKey(); return; }
  sel.disabled = false;
  sel.innerHTML = proj.phases.map((i) => `<option value="${esc(i.key)}" ${i.key === proj.suggested ? "selected" : ""}>${esc(i.label)}${i.done ? " (done)" : ""}${i.key === proj.suggested ? " ★" : ""}</option>`).join("");
  showPickedKey();
}
function showPickedKey() {
  const k = document.getElementById("pk-key");
  if (k) k.textContent = document.getElementById("pk-phase")?.value || "";
}
const pickedIssue = () => document.getElementById("pk-phase")?.value || "";
document.getElementById("pop").addEventListener("input", (ev) => {
  if (ev.target.id === "pk-proj") fillPhases(pickedProject());
  if (ev.target.id === "as-start" || ev.target.id === "as-end") showAssignLength();
});
document.getElementById("pop").addEventListener("change", (ev) => {
  if (ev.target.id === "pk-proj") fillPhases(pickedProject());
  if (ev.target.id === "pk-phase") showPickedKey();
  const row = ev.target.closest("[data-ad-key]");
  if (row) {
    const key = row.dataset.adKey;
    if (ev.target.matches("[data-ad-on]")) saveAllDay({ key, on: ev.target.checked });
    if (ev.target.matches("[data-ad-issue]")) saveAllDay({ key, issue: ev.target.value || null });
    if (ev.target.matches("[data-ad-h]")) saveAllDay({ key, minutes: ev.target.value === "" ? null : Math.round(parseFloat(ev.target.value.replace(",", ".")) * 60) });
  }
});

/* --------------------------------------------- all-day events of a day: you choose what to fill */
let issueChoices = null; // [{key, label}] for the project – phase drop-downs
let allDayOpen = null;   // the day whose chooser is open
async function openAllDayPop(date, target) {
  const d = lastPlan?.days.find((x) => x.date === date);
  if (!d) return;
  if (!issueChoices) { try { issueChoices = await api("/api/issues"); } catch { issueChoices = []; } }
  allDayOpen = date;
  const pop = document.getElementById("pop");
  const list = d.candidates || [];
  const options = (cur) => {
    const opts = issueChoices.some((o) => o.key === cur) || !cur ? issueChoices : [{ key: cur, label: issueTitle(cur) }, ...issueChoices];
    return `<option value="">— pick a project – phase —</option>` + opts.map((o) =>
      `<option value="${esc(o.key)}" ${o.key === cur ? "selected" : ""}>${esc(o.label)} (${esc(o.key)})</option>`).join("");
  };
  const total = list.reduce((n, x) => n + (x.on ? x.minutes : 0), 0);
  const over = total > d.all_day_room;
  pop.innerHTML = `
    <div class="small muted">${esc(dayLabel(date))} · all-day events</div>
    <div class="pop-title">What to fill this day</div>
    ${list.length ? `<table class="ad-list"><thead><tr><th></th><th>Event</th><th>Project – phase</th><th>Hours</th></tr></thead><tbody>
      ${list.map((x) => `<tr data-ad-key="${esc(x.key)}" class="${x.on ? "" : "off"}">
        <td><input type="checkbox" data-ad-on ${x.on ? "checked" : ""} ${x.edited || x.posted ? "disabled" : ""} title="fill this event"></td>
        <td><b>${esc(x.subject)}</b> <span class="tag tag-${esc(x.show_as)}">${esc(x.show_as)}</span>${!x.issue && x.reason ? `<div class="small muted">${esc(x.reason)}</div>` : ""}</td>
        <td>${x.edited || x.posted ? `<span class="small">${x.posted ? "in Jira" : `changed on the calendar · ${hrs(x.edited_minutes)}`}</span>
          ${x.edited ? `<button class="btn tiny" data-ad-undo="${esc(x.override_ids.join(","))}" title="your changes to its block are removed; it gets its share again">back to automatic</button>` : ""}`
          : `<select data-ad-issue>${options(x.issue)}</select>`}</td>
        <td>${x.edited || x.posted ? "" : `<input type="number" data-ad-h min="0" max="24" step="0.25" value="${x.on ? +(x.minutes / 60).toFixed(2) : ""}" placeholder="${x.on ? "" : "0"}"
          title="${x.user_minutes === null ? "default share; type to set your own" : "your hours; empty = back to the default share"}" ${x.on ? "" : "disabled"}>
          ${x.user_minutes !== null && x.on ? `<div class="small muted">default ${hrs(x.default_minutes)}</div>` : ""}`}</td>
      </tr>`).join("")}</tbody></table>` : `<p class="muted small">No all-day events this day.</p>`}
    ${(d.all_day_timed || []).length ? `<div class="small muted ad-timed">Timed events this day (taken first): ${d.all_day_timed.map((x) =>
      `${esc(x.label)} ${x.start}–${x.end} (${hrs(x.minutes)})`).join(" · ")}</div>` : ""}
    <div class="ad-sum ${over ? "warn" : ""}">All-day total <b>${hrs(total)}</b> of <b>${hrs(d.all_day_room)}</b> left
      <span class="muted small">(day ${hrs(d.target)} − Jira ${hrs(d.logged)} − timed ${hrs(Math.max(0, d.target - d.logged - d.all_day_room))})</span>
      ${over ? `<div class="small">More than the day has left, because you typed it.</div>` : ""}</div>
    <div class="pop-actions"><button class="btn tiny" data-ad-reset title="back to the default for this day">Reset day</button>
      <button class="btn tiny primary" id="pop-cancel">Done</button></div>`;
  delete pop.dataset.mode;
  placePop(target, true);
}
async function saveAllDay(change) {
  const date = allDayOpen;
  if (!date) return;
  try {
    if (change.undo) for (const id of change.undo) await api(`/api/overrides/${encodeURIComponent(id)}`, { method: "DELETE" });
    else if (change.reset) await api("/api/allday/reset", { method: "POST", body: { date } });
    else await api("/api/allday", { method: "POST", body: { date, ...change } });
  } catch (e) { toast(e.message, true); return; }
  await renderStatus(); // redraw from what was read (no Outlook / Jira reading)
  const anchor = document.querySelector(`.cal-ad [data-allday="${date}"]`) || document.querySelector(`.cal-col[data-date="${date}"]`);
  if (anchor) openAllDayPop(date, anchor);
}

/* assign a missing / not matched block */
function openPop(target, given = null) {
  const info = given || JSON.parse(target.dataset.pick);
  const pop = document.getElementById("pop");
  pop.innerHTML = `
    <div class="small muted">${esc(dayLabel(info.date))}</div>
    ${info.label ? `<div class="pop-title">${esc(info.label)}</div>` : `<div class="pop-title">Missing time</div>`}
    <div id="pk"></div>
    <div class="pl-times"><label class="small muted">from <input type="time" id="as-start" step="900" value="${esc(info.start)}"></label>
      <label class="small muted">to <input type="time" id="as-end" step="900" value="${esc(info.end)}"></label>
      <span class="small muted" id="as-len"></span></div>
    <div class="len-btns"><button class="btn tiny" data-len="-15" title="15 minutes shorter">−15 min</button><button class="btn tiny" data-len="15" title="15 minutes longer">+15 min</button></div>
    <div class="pop-actions"><button class="btn tiny" id="pop-cancel">Cancel</button><button class="btn tiny primary" id="pop-ok">Assign</button></div>`;
  pop.dataset.info = JSON.stringify(info);
  showAssignLength();
  delete pop.dataset.mode;
  placePop(target);
  mountPicker(info.label, info.issue || "", target);
}
function closePop() {
  const p = document.getElementById("pop");
  p.classList.remove("wide");
  allDayOpen = null;
  if (!p || p.style.display !== "block") return;
  p.style.display = "none";
  document.querySelectorAll(".blk.selecting").forEach((x) => x.remove()); // a cancelled mouse selection
  if (p.dataset.mode === "move") { delete p.dataset.mode; renderStatus(); } // cancelled move: put the block back
}
const toMinutes = (v) => { const [h, m] = String(v || "").split(":").map(Number); return h * 60 + m; };
function showAssignLength() {
  const a = toMinutes(document.getElementById("as-start")?.value), b = toMinutes(document.getElementById("as-end")?.value);
  const out = document.getElementById("as-len");
  if (out) out.textContent = b > a ? hrs(b - a) : "";
}
function changeAssignLength(delta) {
  const a = toMinutes(document.getElementById("as-start").value);
  const endEl = document.getElementById("as-end");
  const b = Math.max(a + 15, Math.min(24 * 60, toMinutes(endEl.value) + delta));
  endEl.value = fmtHM(b);
  showAssignLength();
}
async function submitPop() {
  const pop = document.getElementById("pop");
  const issue = pickedIssue();
  if (!issue) return toast("Pick a project and phase", true);
  const start = document.getElementById("as-start").value, end = document.getElementById("as-end").value;
  if (!(toMinutes(end) > toMinutes(start))) return toast("“to” must be after “from”", true);
  try {
    const info = JSON.parse(pop.dataset.info);
    if (info.replaces) // a calendar event: your entry replaces it (so it is never proposed twice)
      await api("/api/overrides/replace", { method: "POST", body: { replaces: info.replaces, items: [{ date: info.date, start, end, issue, label: info.label }] } });
    else await api("/api/overrides", { method: "POST", body: { date: info.date, label: info.label, start, end, issue } });
    closePop(); toast(`Assigned ${hrs(toMinutes(end) - toMinutes(start))}`); renderStatus();
  }
  catch (e) { toast(e.message, true); }
}

/* Mouse steps: 15 minutes; hold Alt for 5. */
const dragStep = (ev) => (ev.altKey ? 5 : 15);

/* choose part of a missing slot with the mouse: drag over the red block, then assign that range */
let sel = null;
const minuteAt = (col, clientY) => grid.lo + ((clientY - col.getBoundingClientRect().top) / PX_PER_HOUR) * 60;
view.addEventListener("pointerdown", (ev) => {
  const el = ev.target.closest(".blk.missing[data-slot]");
  if (!el || ev.button !== 0 || document.getElementById("pop").style.display === "block") return;
  const col = el.closest(".cal-col");
  sel = { el, col, slot: JSON.parse(el.dataset.slot), anchor: minuteAt(col, ev.clientY), x0: ev.clientX, y0: ev.clientY, moved: false, box: null };
  ev.preventDefault();
});
window.addEventListener("pointermove", (ev) => {
  if (!sel) return;
  if (!sel.moved && Math.hypot(ev.clientX - sel.x0, ev.clientY - sel.y0) < 4) return;
  if (!sel.moved) {
    sel.moved = true;
    sel.box = document.createElement("div");
    sel.box.className = "blk selecting";
    sel.col.appendChild(sel.box);
    document.body.classList.add("dragging-blk");
  }
  const step = dragStep(ev);
  const at = minuteAt(sel.col, ev.clientY);
  const lo = Math.min(sel.anchor, at), hi = Math.max(sel.anchor, at);
  // whole steps on the clock (:00 / :15 / :30 / :45), at least one step, inside the missing slot
  let a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  if (b - a < step) b = a + step;
  a = Math.max(sel.slot.start, a); b = Math.min(sel.slot.end, b);
  if (b <= a) { a = sel.slot.start; b = Math.min(sel.slot.end, a + step); }
  Object.assign(sel, { start: a, end: b });
  sel.box.style.top = `${yOf(a)}px`;
  sel.box.style.height = `${Math.max(yOf(b) - yOf(a), 14)}px`;
  sel.box.innerHTML = `<b>${hrs(b - a)}</b><div class="bt">${fmtHM(a)}–${fmtHM(b)}</div>`;
});
window.addEventListener("pointerup", () => {
  if (!sel) return;
  const x = sel;
  sel = null;
  document.body.classList.remove("dragging-blk");
  if (!x.moved) return; // a plain click assigns the whole slot (click handler)
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 60);
  openPop(x.box, { date: x.slot.date, start: fmtHM(x.start), end: fmtHM(x.end), label: "" });
});

/* move / resize a worklog that is already in Jira */
let drag = null;
let justDragged = false;
const snapTo = (m, step) => Math.round(m / step) * step;
const dayLabel = (date) => new Date(date + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

view.addEventListener("pointerdown", (ev) => {
  const el = ev.target.closest(".blk.movable[data-wl], .blk.editable[data-pl]");
  if (!el || ev.button !== 0 || ev.target.closest("button") || document.getElementById("pop").dataset.mode === "move") return;
  const wl = JSON.parse(el.dataset.wl || el.dataset.pl);
  const col = el.closest(".cal-col");
  const mode = ev.target.classList.contains("rs-top") ? "top" : ev.target.classList.contains("rs-bot") ? "bottom" : "move";
  const grabMin = grid.lo + ((ev.clientY - col.getBoundingClientRect().top) / PX_PER_HOUR) * 60;
  drag = { el, wl, mode, col, x0: ev.clientX, y0: ev.clientY, moved: false, grab: grabMin - wl.start, date: wl.date, start: wl.start, end: wl.end };
  ev.preventDefault(); // no text selection while dragging
});

window.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 4) return;
  if (!drag.moved) { drag.moved = true; drag.el.classList.add("dragging"); document.body.classList.add("dragging-blk"); }
  const step = dragStep(ev);
  const { wl, el } = drag;
  const dur = wl.end - wl.start;
  let col = drag.col;
  if (drag.mode === "move") {
    const hit = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList?.contains("cal-col"));
    if (hit) col = hit;
  }
  const at = grid.lo + ((ev.clientY - col.getBoundingClientRect().top) / PX_PER_HOUR) * 60;
  let s = drag.start, e = drag.end;
  if (drag.mode === "move") { s = Math.max(0, Math.min(1440 - dur, snapTo(at - drag.grab, step))); e = s + dur; }
  if (drag.mode === "bottom") { s = wl.start; e = Math.max(s + step, Math.min(1440, snapTo(at, step))); }
  if (drag.mode === "top") { e = wl.end; s = Math.max(0, Math.min(e - step, snapTo(at, step))); }
  if (col !== el.parentElement) col.appendChild(el);
  drag.col = col;
  Object.assign(drag, { date: col.dataset.date, start: s, end: e });
  el.style.top = `${yOf(s)}px`;
  el.style.height = `${Math.max(yOf(e) - yOf(s), 14)}px`;
  const b = el.querySelector(".bt .hm");
  if (b) b.textContent = hrs(e - s);
  const t = el.querySelector(".bt .tm");
  if (t) t.textContent = `${fmtHM(s)}–${fmtHM(e)}`;
});

window.addEventListener("pointerup", () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  document.body.classList.remove("dragging-blk");
  if (!d.moved) return;
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 60);
  d.el.classList.remove("dragging");
  const { wl } = d;
  if (d.date === wl.date && d.start === wl.start && d.end === wl.end) return;
  if (d.el.dataset.pl) return applyPlanned(wl, { date: d.date, start: d.start, end: d.end, issue: wl.issue }); // local, no confirm
  openLoggedPop(d.el, wl, { date: d.date, start: d.start, end: d.end });
});

/* A worklog already in Jira: change its project/phase and/or time. Jira changes only after "Update in Jira". */
function openLoggedPop(target, wl, to = null) {
  const pop = document.getElementById("pop");
  const from = { date: wl.date, start: wl.start, end: wl.end };
  const at = to || from;
  const span = (x) => `${esc(dayLabel(x.date))} ${fmtHM(x.start)}–${fmtHM(x.end)} <span class="muted">(${hrs(x.end - x.start)})</span>`;
  pop.innerHTML = `
    <div class="small muted">Worklog in Jira · ${esc(dayLabel(at.date))}</div>
    <div class="pop-title">${issueHtml(wl.issue)}</div>
    ${to ? `<div class="mv-row"><span class="muted">was</span> ${span(from)}</div>` : ""}
    <div id="pk"></div>
    <div class="pl-times"><label class="small muted">from <input type="time" id="lg-start" step="300" value="${fmtHM(at.start)}"></label>
      <label class="small muted">to <input type="time" id="lg-end" step="300" value="${fmtHM(at.end)}"></label></div>
    <div class="small muted" style="margin-top:6px">Another project or phase: the worklog is created there (same time and comment) and removed from ${esc(wl.issue)}.</div>
    <div class="pop-actions"><button class="btn tiny" id="mv-cancel">Cancel</button><button class="btn tiny primary" id="mv-ok">Update in Jira</button></div>`;
  pop.dataset.mode = to ? "move" : "logged"; // a cancelled drag puts the block back
  pop.dataset.move = JSON.stringify({ issue: wl.issue, id: wl.id, date: at.date });
  placePop(target);
  mountPicker("", wl.issue, target);
}

async function submitMove() {
  const pop = document.getElementById("pop");
  const mv = JSON.parse(pop.dataset.move);
  const toMin = (v) => { const [h, m] = String(v).split(":").map(Number); return h * 60 + m; };
  const start = toMin(document.getElementById("lg-start").value), end = toMin(document.getElementById("lg-end").value);
  const issue = pickedIssue() || mv.issue;
  if (!(end > start)) return toast("“to” must be after “from”", true);
  const btn = document.getElementById("mv-ok");
  btn.disabled = true; btn.textContent = "Updating…";
  try {
    const r = await api(`/api/worklogs/${encodeURIComponent(mv.issue)}/${encodeURIComponent(mv.id)}`,
      { method: "PUT", body: { date: mv.date, start: fmtHM(start), minutes: end - start, issue } });
    toast(issue !== mv.issue
      ? `Moved to ${issueTitle(r.issue || issue)} · ${dayLabel(mv.date)} ${fmtHM(start)}–${fmtHM(end)}`
      : `${issueTitle(mv.issue)} · ${dayLabel(mv.date)} ${fmtHM(start)}–${fmtHM(end)}`);
  } catch (e) { toast(e.message, true); }
  pop.style.display = "none";
  delete pop.dataset.mode;
  renderStatus();
}

/** Before one all-day block is changed: the day's other all-day events keep the hours they have now. */
async function freezeOtherAllDay(pl) {
  const day = lastPlan?.days.find((x) => x.date === pl.date);
  for (const x of day?.candidates || [])
    if (x.on && !x.edited && !x.posted && x.user_minutes === null && x.edit_key !== pl.event_key)
      await api("/api/allday", { method: "POST", body: { date: pl.date, key: x.key, minutes: x.minutes } });
}
const candidateOf = (pl) => lastPlan?.days.find((x) => x.date === pl.date)?.candidates?.find((x) => x.edit_key === pl.event_key);

/* change a "to fill" block (from the calendar or a manual entry). Nothing goes to Jira here. */
async function applyPlanned(pl, to) {
  try {
    if (pl.source === "all_day") await freezeOtherAllDay(pl);
    if (pl.source === "manual" && pl.override_id) {
      await api(`/api/overrides/${encodeURIComponent(pl.override_id)}`, { method: "PATCH", body: { date: to.date, start: fmtHM(to.start), end: fmtHM(to.end), issue: to.issue } });
    } else {
      // replace the calendar event: the changed piece + its other pieces (e.g. before/after lunch) unchanged
      const day = lastPlan?.days.find((x) => x.date === pl.date);
      const others = (day?.segments || []).filter((x) => (x.kind === "planned" || x.kind === "vacation") && ["calendar", "all_day", "vacation"].includes(x.source)
        && x.event_key === pl.event_key && x.start !== pl.start);
      const items = [...others.map((x) => ({ date: pl.date, start: fmtHM(x.start), end: fmtHM(x.end), issue: x.issue, label: x.label })),
        { date: to.date, start: fmtHM(to.start), end: fmtHM(to.end), issue: to.issue, label: pl.label }];
      await api("/api/overrides/replace", { method: "POST", body: { replaces: pl.event_key, items } });
    }
    toast(`${issueTitle(to.issue)} ${dayLabel(to.date)} ${fmtHM(to.start)}–${fmtHM(to.end)} — changed here only, Jira after approval`);
  } catch (e) { toast(e.message, true); }
  renderStatus();
}

function openPlanPop(target) {
  const pl = JSON.parse(target.dataset.pl);
  const pop = document.getElementById("pop");
  pop.innerHTML = `
    <div class="small muted">${esc(dayLabel(pl.date))} · to fill${pl.source === "manual" ? " · changed by you" : pl.source === "all_day" ? " · all-day event (hours of the day: click it in the all-day row)" : " · from your calendar"}</div>
    ${pl.label ? `<div class="pop-title">${esc(pl.label)}</div>` : ""}
    <div id="pk"></div>
    <div class="pl-times"><label class="small muted">from <input type="time" id="pl-start" step="300" value="${fmtHM(pl.start)}"></label>
      <label class="small muted">to <input type="time" id="pl-end" step="300" value="${fmtHM(pl.end)}"></label></div>
    <div class="pop-actions"><button class="btn tiny" id="pl-skip" title="don't propose this one at all">Don't fill</button><span class="grow"></span>
      <button class="btn tiny" id="pop-cancel">Cancel</button><button class="btn tiny" id="pl-ok">Save</button>${sendButton(pl)}</div>`;
  pop.dataset.pl = target.dataset.pl;
  delete pop.dataset.mode;
  placePop(target);
  mountPicker(pl.label, pl.issue, target);
}

async function submitPlanPop() {
  const pop = document.getElementById("pop");
  const pl = JSON.parse(pop.dataset.pl);
  const issue = pickedIssue();
  const toMin = (v) => { const [h, m] = String(v).split(":").map(Number); return h * 60 + m; };
  const start = toMin(document.getElementById("pl-start").value), end = toMin(document.getElementById("pl-end").value);
  if (!issue) return toast("Pick a project and phase", true);
  if (!(end > start)) return toast("“to” must be after “from”", true);
  pop.style.display = "none";
  applyPlanned(pl, { date: pl.date, start, end, issue });
}

/* Send this one worklog to Jira from its box: one click (that click is your approval of this worklog). */
/** The worklog (entry) this block belongs to: same day and issue, and the entry covers the block. */
const entryOf = (pl) => (lastPlan?.days.find((d) => d.date === pl.date)?.entries || [])
  .find((e) => e.issue === pl.issue && e.start <= pl.start && e.end >= pl.end);
function sendButton(pl) {
  const e = entryOf(pl);
  if (!e) return "";
  // in the same row as Save; when it can't be sent, greyed out and the reason on hover
  const why = !lastPlan?.jira_ok ? "Jira is not connected" : e.future ? "can be sent once it has happened" : "";
  return `<button class="btn tiny primary" id="pl-send" ${why ? `disabled title="${esc(why)}"`
    : `title="${esc(`writes ${hrs(e.minutes)} on ${issueTitle(e.issue)}, ${e.start_hm}–${e.end_hm}, to Jira now`
      + (e.start < pl.start || e.end > pl.end ? `\n(this block and the touching block(s) of the same issue: one worklog)` : "")
      + `\ncomment: ${e.comment || "(none)"}`)}"`}>Send to Jira</button>`;
}
async function sendPlanned(btn) {
  const pop = document.getElementById("pop");
  const pl = JSON.parse(pop.dataset.pl);
  const e = entryOf(pl);
  if (!e) return toast("This block isn't a worklog to send any more — reload the page", true);
  // what is in the box must be what is sent: unsaved changes first
  const start = toMinutes(document.getElementById("pl-start")?.value), end = toMinutes(document.getElementById("pl-end")?.value);
  if (start !== pl.start || end !== pl.end || (pickedIssue() && pickedIssue() !== pl.issue))
    return toast("You changed this block: press Save first, then send it", true);
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const r = await api("/api/fill", { method: "POST", body: { from: pl.date, to: pl.date, approved: [e.id] } });
    if (r.done.length) toast(`Sent to Jira: ${hrs(e.minutes)} on ${issueTitle(e.issue)}, ${dayLabel(pl.date)} ${e.start_hm}–${e.end_hm}`);
    else toast(`Not sent: ${(r.failed[0] || r.skipped[0])?.error || "it changed meanwhile"}`, true);
  } catch (x) { toast(x.message, true); }
  closePop();
  renderStatus();
}

async function skipPlanned() {
  const pop = document.getElementById("pop");
  const pl = JSON.parse(pop.dataset.pl);
  pop.style.display = "none";
  try {
    const cand = pl.source === "all_day" ? candidateOf(pl) : null;
    if (cand) { // an all-day event: unticked for that day (tick it again in the all-day row)
      await freezeOtherAllDay(pl);
      await api("/api/allday", { method: "POST", body: { date: pl.date, key: cand.key, on: false } });
      toast("Won't be filled this day — tick it again in the all-day row");
      return renderStatus();
    }
    if (pl.event_key) await api("/api/overrides/skip", { method: "POST", body: { replaces: pl.event_key, date: pl.date, label: pl.label } });
    else await api(`/api/overrides/${encodeURIComponent(pl.override_id)}`, { method: "DELETE" });
    toast("Won't be filled — ↺ on the faded block brings it back");
  } catch (e) { toast(e.message, true); }
  renderStatus();
}

/* review & approve: every worklog must be ticked by hand before it is posted */
let lastPlan = null;

function openReview(onlyDate) {
  if (!lastPlan) return;
  const days = lastPlan.days.filter((d) => !onlyDate || d.date === onlyDate);
  const rows = days.flatMap((d) => d.entries.map((e) => ({ d, e })));
  if (!rows.length) return toast("Nothing to fill here");
  const dlg = document.getElementById("review");
  dlg.innerHTML = `
    <div class="rv-box card">
      <div class="rv-head">
        <div><h2>Approve worklogs</h2>
          <div class="small muted">Tick each worklog you want written to Jira. Unticked ones are not sent. Nothing is changed in Outlook.</div></div>
        <button class="x" data-rv="close" title="close">×</button>
      </div>
      <div class="rv-scroll">
        <table class="rv">
          <thead><tr><th><label class="rv-all"><input type="checkbox" id="rv-all-box" title="select all (worklogs later than now stay unticked)"> Approve</label></th><th>Day</th><th>Time</th><th>Hours</th><th>Jira issue</th><th>Comment written to Jira</th><th>From</th><th>Result</th></tr></thead>
          <tbody>${rows.map(({ d, e }) => `
            <tr data-id="${esc(e.id)}" class="${e.future ? "fut" : ""}">
              <td><input type="checkbox" class="rv-ok ${e.future ? "fut" : ""}" value="${esc(e.id)}"></td>
              <td class="nowrap">${esc(new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))}</td>
              <td class="mono nowrap">${e.start_hm}–${e.end_hm}</td>
              <td class="mono">${hrs(e.minutes)}</td>
              <td><b>${esc(issueTitle(e.issue))}</b><div class="ik">${esc(e.issue)}</div></td>
              <td class="small">${e.comment ? esc(e.comment) : `<span class="muted">(none)</span>`}</td>
              <td class="small">${esc(e.source)}${e.future ? `<div class="warn">not happened yet</div>` : ""}</td>
              <td class="rv-res small"></td>
            </tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="rv-foot">
        <span id="rv-sum" class="muted">0 approved</span><span class="grow"></span>
        <button class="btn" data-rv="close">Cancel</button>
        <button class="btn primary" id="rv-post" disabled>Post approved to Jira</button>
      </div>
    </div>`;
  dlg.dataset.from = days[0].date;
  dlg.dataset.to = days[days.length - 1].date;
  delete dlg.dataset.dirty;
  dlg.style.display = "flex";
  reviewSelection();
}

function reviewSelection() {
  const ids = [...document.querySelectorAll("#review .rv-ok:checked")].map((c) => c.value);
  const minutes = ids.reduce((a, id) => a + +id.split("|")[3], 0);
  document.getElementById("rv-sum").textContent = `${ids.length} approved · ${hrs(minutes)}`;
  const btn = document.getElementById("rv-post");
  btn.disabled = !ids.length;
  btn.textContent = ids.length ? `Post ${ids.length} approved to Jira` : "Post approved to Jira";
  // the header box: ticked when all are, half when some are
  const done = [...document.querySelectorAll("#review .rv-ok:not(.fut):not(:disabled)")];
  const box = document.getElementById("rv-all-box");
  if (box) {
    const n = done.filter((c) => c.checked).length;
    box.disabled = !done.length;
    box.checked = !!done.length && n === done.length;
    box.indeterminate = n > 0 && n < done.length;
  }
  return ids;
}

async function postReview() {
  const dlg = document.getElementById("review");
  const ids = reviewSelection();
  if (!ids.length) return;
  const btn = document.getElementById("rv-post");
  btn.disabled = true; btn.textContent = "Posting…";
  dlg.querySelectorAll("input").forEach((i) => (i.disabled = true));
  try {
    const r = await api("/api/fill", { method: "POST", body: { from: dlg.dataset.from, to: dlg.dataset.to, approved: ids } });
    const mark = (list, css, text) => list.forEach((x) => {
      const cell = dlg.querySelector(`tr[data-id="${CSS.escape(x.id)}"] .rv-res`);
      if (cell) cell.innerHTML = `<span class="${css}">${text}${x.error ? ": " + esc(x.error) : ""}</span>`;
    });
    mark(r.done, "ok", "✓ posted"); mark(r.failed, "bad", "✗ failed"); mark(r.skipped, "warn", "skipped");
    toast(`${r.done.length} posted${r.failed.length ? `, ${r.failed.length} failed` : ""}${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`, !!r.failed.length);
  } catch (e) { toast(e.message, true); }
  btn.textContent = "Done";
  dlg.querySelectorAll("[data-rv=close]").forEach((b) => b.classList.contains("btn") && (b.textContent = "Close"));
  dlg.dataset.dirty = "1";
}

/* ------------------------------------------------- Jira vs. calendar differences */
const diffById = (id) => (lastPlan?.days || []).flatMap((d) => (d.diffs || []).map((x) => ({ ...x, date: d.date }))).find((x) => x.id === id);
const weekDiffIds = () => (lastPlan?.days || []).flatMap((d) => d.diffs_ignored || []);
const quote = (x) => `“${esc(x)}”`;
/** What is different, in plain words: what Jira has, and what your calendar has. */
function diffLines(d) {
  const cal = (list) => list.map((e) => `${quote(e.subject)} ${e.start_hm}–${e.end_hm}`).join(", ");
  const jira = (list) => list.map((w) => `${esc(issueTitle(w.issue))} ${w.start_hm}–${w.end_hm}`).join(", ");
  if (d.side === "jira") return {
    jira: `${esc(issueTitle(d.issue))} · ${d.start_hm}–${d.end_hm}${d.comment ? ` · ${quote(d.comment)}` : ""}`,
    calendar: d.why === "time" ? `this project is at another time: ${cal(d.calendar)}`
      : d.calendar.length ? `nothing for this project at this time (you have ${cal(d.calendar)})` : "nothing at this time",
  };
  return {
    calendar: `${quote(d.subject)} · ${d.start_hm}–${d.end_hm} → ${esc(issueTitle(d.issue))}`,
    jira: d.why === "time" ? `this project is logged at another time: ${jira(d.jira)}`
      : d.why === "other" ? `this time is logged on something else: ${jira(d.jira)}`
      : "nothing for it. It was not proposed because the day already has its hours: press “Fill it” to add it anyway.",
  };
}
function openDiffPop(target) {
  const d = diffById(target.dataset.diff);
  if (!d) return;
  const pop = document.getElementById("pop");
  const l = diffLines(d);
  pop.innerHTML = `
    <div class="small muted">${esc(dayLabel(d.date))} · Jira and your calendar don't match</div>
    <div class="pop-title">${d.side === "jira" ? "In Jira, not like your calendar" : "In your calendar, not in Jira"}</div>
    <div class="diff-row"><span class="diff-k">In Jira</span><span>${l.jira}</span></div>
    <div class="diff-row"><span class="diff-k">In calendar</span><span>${l.calendar}</span></div>
    <div class="small muted" style="margin-top:6px">Ignore it if this is how you want it. Nothing is changed in Jira or Outlook.</div>
    <div class="pop-actions"><button class="btn tiny" id="pop-cancel">Close</button>
      ${target.dataset.wl ? `<button class="btn tiny" id="diff-edit">Change worklog…</button>` : ""}
      ${d.side === "calendar" ? `<button class="btn tiny" id="diff-assign" title="choose the project and phase, and the time">Other project…</button>
        ${d.issue ? `<button class="btn tiny primary" id="diff-fill" title="propose it as a worklog on ${esc(issueTitle(d.issue))}, ${d.start_hm}–${d.end_hm}">Fill it</button>` : ""}` : ""}
      <button class="btn tiny ${d.side === "calendar" && d.issue ? "" : "primary"}" data-diff-ignore="${esc(d.id)}">Ignore</button></div>`;
  delete pop.dataset.mode;
  diffTarget = target;
  placePop(target);
}
let diffTarget = null;
/** A calendar event that isn't in Jira: add it as a worklog to fill (Review & approve still asks), or open the assign box. */
async function fillDiff(choose) {
  const d = diffById(diffTarget?.dataset.diff);
  if (!d) return;
  const info = { date: d.date, start: d.start_hm, end: d.end_hm, label: d.subject, issue: d.issue, replaces: d.id.slice(3) };
  if (choose) { const tg = diffTarget; closePop(); return openPop(tg, info); }
  try {
    await api("/api/overrides/replace", { method: "POST", body: { replaces: info.replaces, items: [{ date: info.date, start: info.start, end: info.end, issue: info.issue, label: info.label }] } });
    closePop(); toast(`Added ${d.subject} ${d.start_hm}–${d.end_hm} to fill`); renderStatus();
  } catch (e) { toast(e.message, true); }
}
function openDiffWeek() {
  const days = lastPlan?.days || [];
  const rows = days.flatMap((d) => (d.diffs || []).map((x) => ({ ...x, date: d.date })));
  const nIgnored = weekDiffIds().length;
  const dlg = document.getElementById("review");
  dlg.innerHTML = `
    <div class="rv-box card">
      <div class="rv-head">
        <div><h2>Jira and calendar differences</h2>
          <div class="small muted">Worklogs in Jira that are not in your calendar at that time, and calendar events of your projects that are not in Jira. Ignoring changes nothing in Jira or Outlook; it only removes the warning.</div></div>
        <button class="x" data-rv="close" title="close">×</button>
      </div>
      <div class="rv-scroll">
        ${rows.length ? `<table class="rv">
          <thead><tr><th>Day</th><th>Time</th><th>In Jira</th><th>In calendar</th><th></th></tr></thead>
          <tbody>${rows.map((d) => { const l = diffLines(d); return `
            <tr data-id="${esc(d.id)}">
              <td class="nowrap">${esc(dayLabel(d.date))}</td>
              <td class="mono nowrap">${d.start_hm}–${d.end_hm}</td>
              <td class="small">${l.jira}</td>
              <td class="small">${l.calendar}</td>
              <td><button class="btn tiny" data-diff-ignore="${esc(d.id)}">Ignore</button></td>
            </tr>`; }).join("")}</tbody>
        </table>` : `<p class="muted">No differences left this week.</p>`}
      </div>
      <div class="rv-foot">
        <span class="muted">${rows.length} to check${nIgnored ? ` · ${nIgnored} ignored` : ""}</span><span class="grow"></span>
        ${nIgnored ? `<button class="btn" id="diff-unignore-week" title="Show the ignored differences of this week again">Show ${nIgnored} ignored again</button>` : ""}
        <button class="btn" data-rv="close">Close</button>
        ${rows.length ? `<button class="btn primary" id="diff-ignore-week">Ignore all ${rows.length}</button>` : ""}
      </div>
    </div>`;
  delete dlg.dataset.dirty;
  dlg.style.display = "flex";
}
async function ignoreDiffs(ids, undo = false) {
  if (!ids.length) return;
  try {
    await api(`/api/diffs/${undo ? "unignore" : "ignore"}`, { method: "POST", body: { ids } });
    toast(undo ? "Shown again" : ids.length > 1 ? `${ids.length} differences ignored` : "Ignored");
  } catch (e) { toast(e.message, true); return; }
  const dlg = document.getElementById("review");
  if (dlg.style.display === "flex") { // the week list: redraw the calendar, keep the list open
    dlg.style.display = "none";
    await renderStatus();
    openDiffWeek();
  } else { closePop(); renderStatus(); }
}

function closeReview() {
  const dlg = document.getElementById("review");
  dlg.style.display = "none";
  if (dlg.dataset.dirty) { delete dlg.dataset.dirty; renderStatus(); }
}

/* ------------------------------------------------------------------ settings */
async function renderSettings() {
  const live = startPage("settings");
  if (!live) return;
  view.innerHTML = `<div class="loading">Loading…</div>`;
  let s;
  try { s = await api("/api/settings"); }
  catch (e) { if (live()) view.innerHTML = `<div class="banner err">${esc(e.message)}</div>`; return; }
  if (!live()) return;
  const f = (label, input, help = "") => `<div class="field"><label>${label}</label><div>${input}${help ? `<div class="help">${help}</div>` : ""}</div></div>`;
  const txt = (name, val, ph = "", type = "text") => `<input type="${type}" name="${name}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  view.innerHTML = `
    <div class="bar-row"><h1>Settings</h1><span class="grow"></span><button class="btn primary" id="save">Save</button></div>
    <form class="settings" id="sform" autocomplete="off">
      <fieldset><legend>Updates</legend>
        ${f("Timefill version", `<b>${esc(chrome.runtime.getManifest().version)}</b>
          <button type="button" class="btn" id="upd-check" style="margin-left:10px">Check for updates</button>
          <button type="button" class="btn primary" id="upd-go" hidden>Update now</button> <span id="upd-status" class="small muted"></span>`,
          "Updates come from Timefill's stable release on GitHub, installed with one click (your settings are kept). Needs Timefill installed with “Install Timefill.cmd”.")}
      </fieldset>
      <fieldset><legend>Jira</legend>
        ${f("Jira URL", txt("jira_url", s.jira_url, "https://yourcompany.atlassian.net", "url"))}
        ${f("Sign-in", `<select name="jira_auth"><option value="browser" ${s.jira_auth !== "token" ? "selected" : ""}>Use my Jira login in this browser (no token)</option><option value="token" ${s.jira_auth === "token" ? "selected" : ""}>E-mail + API token</option></select>`,
            "With “my Jira login”, just be signed in to Jira in this browser. Use a token only if that doesn't work.")}
        ${f("E-mail (token only)", txt("jira_email", s.jira_email, "you@company.com"))}
        ${f("API token (token only)", txt("jira_token", "", s.token_set ? "•••••••• saved — leave empty to keep" : "paste token", "password"),
            `Create one at <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">id.atlassian.com → Security → API tokens</a>. Stored only in this browser profile.`)}
        ${f("Projects query (JQL)", txt("project_jql", s.project_jql),
            "Issues that make a project yours. A project is the Jira epic of the issue (all its children are its phases, whoever they are assigned to), or — for issues without an epic — every issue with the same project code.")}
        ${f("Project code field", txt("studio_field", s.studio_field, "Project code"),
            "Standalone issues (not under an epic) with the same value here are one project. Without it, the code at the start of the summary is used (e.g. “26.020.SDF”).")}
        ${f("Also add issues I worked on (JQL)", txt("worked_jql", s.worked_jql),
            "Issues you logged time on are added to the project list too (the vacation issue is left out). {track_from} is replaced by the date below. Leave empty to switch off.")}
        ${f("Track from", txt("track_from", s.track_from, "2026-10-01", "date"),
            "Nothing before this day is read or checked: no missing hours, no worklogs proposed, project hours counted from here.")}
        ${f("", `<button type="button" class="btn" id="test-jira">Test Jira connection</button> <span id="tj" class="small muted"></span>`)}
      </fieldset>
      <fieldset><legend>Outlook web (read-only)</legend>
        ${f("How it reads", `<div class="help" style="margin-top:5px">Open your calendar in Outlook web in this browser, in <b>Week</b> or <b>Work week</b> view. Timefill reads the events the page shows (never edits them) every time you move to another week, and when you open the Status page or press “↻ Refresh” there.</div>`)}
        ${f("“Open week” link", txt("outlook_week_url", s.outlook_week_url),
            "Used by “Open week in Outlook”. {yyyy} {m} {d} are replaced by the Monday of the week.")}
        ${f("Dates like 09/11/2026 mean", `<select name="numeric_date_order"><option value="dmy" ${s.numeric_date_order !== "mdy" ? "selected" : ""}>day / month / year</option><option value="mdy" ${s.numeric_date_order === "mdy" ? "selected" : ""}>month / day / year</option></select>`)}
        ${f("Your calendars", txt("own_calendars", s.own_calendars), "Names of your own calendars in Outlook's calendar list (English and Italian: Calendar, Calendario). If other calendars are ticked too (a colleague's, a team calendar), Timefill unticks them for the moment of the read and ticks them again.")}
        ${f("Hidden events", `<label><input type="checkbox" name="expand_more_events" ${s.expand_more_events ? "checked" : ""}> click “+N more events” buttons to read the events Outlook hides (popups are closed again, nothing is edited)</label>`)}
        ${f("Badge in Outlook", `<label><input type="checkbox" name="show_outlook_badge" ${s.show_outlook_badge ? "checked" : ""}> show a small “Timefill” button in the Outlook tab (opens this page)</label>`)}
        ${f("", `<button type="button" class="btn" id="test-cal">Read Outlook now</button> <button type="button" class="btn" id="diagnose">Diagnose Outlook page</button> <span id="tc" class="small muted"></span>
            <div style="margin-top:6px"><input id="diag-find" placeholder="look for an event title, e.g. Big Job demo" style="max-width:280px"></div>`,
            "If events stop being recognised after a Microsoft update, the diagnose output shows the raw text Timefill sees — adjust <span class=\"mono\">outlook-parser.js</span> to match. Type an event title to see exactly how Outlook writes it on the page and why it is (not) read.")}
        <pre id="diag" class="diag" hidden></pre>
      </fieldset>
      <fieldset><legend>Working time</legend>
        ${f("Day starts", txt("day_start", s.day_start, "08:00"))}
        ${f("Lunch break", `<div style="display:flex;gap:8px;align-items:center">${txt("lunch_start", s.lunch_start)} – ${txt("lunch_end", s.lunch_end)}</div>`,
            "Never filled with missing time or vacation; events during lunch still count. Same start and end = no lunch break.")}
        ${f("Hours per day", `<div class="hours">${days.map((d, i) => `<div>${d}<br><input name="h${i}" value="${s.hours_per_weekday[i]}"></div>`).join("")}</div>`,
            "Day ends at start + hours + lunch (8h → 17:00, 7h on Friday → 16:00).")}
        ${f("Public holidays", `<textarea name="holidays" rows="2" placeholder="2026-12-08, 2026-12-25, 2026-12-26">${esc(s.holidays)}</textarea>`, "Dates with no hours expected (YYYY-MM-DD, comma separated).")}
        ${f("Outside working hours", `<label><input type="checkbox" name="clip_to_working_hours" ${s.clip_to_working_hours ? "checked" : ""}> only count calendar time inside the working hours (cut events at day start / end)</label>`,
            "Off (default): an event at 17:00–19:00 or 07:00–08:00 is logged in full. Lunch is never filled either way. Missing hours are always checked inside the working hours.")}
        ${f("Round events to", `<select name="rounding_minutes">${[1, 5, 15, 30].map((m) => `<option value="${m}" ${+s.rounding_minutes === m ? "selected" : ""}>${m === 1 ? "no rounding" : m + " min"}</option>`).join("")}</select>`)}
      </fieldset>
      <fieldset><legend>Phases &amp; roles</legend>
        <div class="help" style="margin-bottom:8px">Your Jira issue summaries end with a <b>phase</b> and a <b>role</b>, e.g. “26.001.P01 Big Job · <b>EXEC</b> · <b>SD</b>”.
          Tell Timefill how they are written in Jira, what to call them, and which words in a calendar event title choose them
          (stand-alone words, any case: “Big Job <b>E</b> <b>installation</b> check”).</div>
        <h3 class="cfg-h">Roles</h3>
        <table class="cfg" id="cfg-roles"><thead><tr><th>In Jira</th><th>Shown as</th><th>Words in the event title</th><th title="used when the title has none of the role words">Default</th><th></th></tr></thead>
          <tbody>${(s.roles || []).map((r) => roleRow(r, r.token === s.default_role)).join("")}</tbody></table>
        <button type="button" class="btn tiny" data-cfg-add="role">+ Add role</button>
        <h3 class="cfg-h">Phases <span class="nocaps muted small">— in lifecycle order (first → last)</span></h3>
        <table class="cfg" id="cfg-phases"><thead><tr><th>In Jira</th><th>Shown as (project status)</th><th>Words in the event title</th><th>Counts as (Charts)</th><th></th></tr></thead>
          <tbody>${(s.phases || []).map(phaseRow).join("")}</tbody></table>
        <button type="button" class="btn tiny" data-cfg-add="phase">+ Add phase</button>
        <div class="help" style="margin-top:8px">A title word chooses that phase whatever the project's status; if the project has no such phase,
          another phase of the same type is used (e.g. feasibility → pre-sale), otherwise the event is shown as “not matched”.</div>
      </fieldset>
      <fieldset><legend>Matching rules</legend>
        ${f("Vacation issue", txt("vacation_issue", s.vacation_issue, "e.g. LEAVE-1"))}
        ${f("Vacation keywords", txt("vacation_keywords", s.vacation_keywords), "All-day events with one of these words fill the whole working day (8h, 7h Friday).")}
        ${f("Out-of-office = vacation", `<label><input type="checkbox" name="use_oof_status" ${s.use_oof_status ? "checked" : ""}> treat all-day events shown as “Out of office” as vacation</label>`)}
        ${f("Ignore events containing", txt("ignore_keywords", s.ignore_keywords))}
        ${f("Worklog comment", `<label><input type="checkbox" name="comment_with_subject" ${s.comment_with_subject ? "checked" : ""}> put the calendar event title in the worklog comment</label>`)}
      </fieldset>
    </form>`;
}

/* Phases & roles tables (Settings) */
const TYPE_LABEL = { presale: "Pre-sale", project: "Project", install: "Installation", internal: "Internal", training: "Training", general: "General" };
const cfgIn = (css, v, ph = "") => `<input class="${css}" value="${esc(v ?? "")}" placeholder="${esc(ph)}">`;
const roleRow = (r = {}, isDefault = false) => `<tr>
  <td>${cfgIn("c-token", r.token, "SD")}</td><td>${cfgIn("c-name", r.name, "Engineering")}</td><td>${cfgIn("c-words", r.words, "E, SD")}</td>
  <td class="c-mid"><input type="radio" name="cfg-default-role" class="c-default" ${isDefault ? "checked" : ""}></td>
  <td class="c-act"><button type="button" class="btn tiny" data-cfg-del title="remove">×</button></td></tr>`;
const phaseRow = (p = {}) => `<tr>
  <td>${cfgIn("c-token", p.token, "EXEC")}</td><td>${cfgIn("c-name", p.name, "Project")}</td><td>${cfgIn("c-words", p.words, "project, execution")}</td>
  <td><select class="c-type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>
  <td class="c-act"><button type="button" class="btn tiny" data-cfg-up title="move up">↑</button><button type="button" class="btn tiny" data-cfg-down title="move down">↓</button><button type="button" class="btn tiny" data-cfg-del title="remove">×</button></td></tr>`;
function collectCfg() {
  const rows = (id) => [...document.querySelectorAll(`#${id} tbody tr`)];
  const val = (tr, css) => tr.querySelector(`.${css}`)?.value ?? "";
  const roles = rows("cfg-roles").map((tr) => ({ token: val(tr, "c-token"), name: val(tr, "c-name"), words: val(tr, "c-words"), def: tr.querySelector(".c-default")?.checked }));
  const phases = rows("cfg-phases").map((tr) => ({ token: val(tr, "c-token"), name: val(tr, "c-name"), words: val(tr, "c-words"), type: val(tr, "c-type") }));
  return { roles: roles.map(({ def, ...r }) => r), phases, default_role: roles.find((r) => r.def)?.token || "" };
}

function collectSettings() {
  const fd = new FormData(document.getElementById("sform"));
  const o = {};
  for (const [k, v] of fd.entries()) if (!/^h\d$/.test(k) && k !== "cfg-default-role") o[k] = v;
  Object.assign(o, collectCfg());
  o.hours_per_weekday = [0, 1, 2, 3, 4, 5, 6].map((i) => parseFloat(fd.get("h" + i)) || 0);
  o.rounding_minutes = +o.rounding_minutes;
  o.use_oof_status = fd.has("use_oof_status");
  o.comment_with_subject = fd.has("comment_with_subject");
  o.show_outlook_badge = fd.has("show_outlook_badge");
  o.clip_to_working_hours = fd.has("clip_to_working_hours");
  o.expand_more_events = fd.has("expand_more_events");
  return o;
}

/* ---------------------------------------------------------------- light / dark */
// The ☾ / ☀ button in the top-right corner. theme.js sets the theme before the page is drawn; your choice is
// remembered in this browser (until then, your system's setting is followed).
function showThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  const b = document.getElementById("theme-toggle");
  if (!b) return;
  b.textContent = dark ? "☀" : "☾";
  b.title = dark ? "Light mode" : "Dark mode";
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("timefill_theme", next); } catch { /* private window */ }
  showThemeButton();
}
showThemeButton();

/* -------------------------------------------------------------------- updates */
// The update helper (set up by "Install Timefill.cmd") checks Timefill's stable release on GitHub and installs it.
// Without the installer (e.g. a copy loaded from a downloaded folder) there is no helper: updates are done by hand.
const UPDATER = "com.timefill.updater";
const askUpdater = (cmd) => new Promise((resolve) => {
  try {
    chrome.runtime.sendNativeMessage(UPDATER, { cmd }, (r) => {
      const err = chrome.runtime.lastError;
      resolve(err ? { ok: false, missing: true, error: err.message } : r || { ok: false, error: "no answer" });
    });
  } catch (e) { resolve({ ok: false, missing: true, error: e.message }); }
});
function showUpdate(r) {
  const bar = document.getElementById("update-bar");
  const go = document.getElementById("upd-go"), status = document.getElementById("upd-status");
  if (r.ok && r.update) {
    bar.hidden = false;
    bar.innerHTML = `Timefill <b>${esc(r.latest)}</b> is available (you have ${esc(r.installed || chrome.runtime.getManifest().version)}).
      <button class="btn tiny primary" id="upd-bar-go">Update now</button>`;
  } else bar.hidden = true;
  if (status) status.textContent = r.ok ? (r.update ? `version ${r.latest} is available` : "you have the latest version")
    : r.missing ? "updates by one click need Timefill installed with “Install Timefill.cmd” (see the README)" : `couldn't check: ${r.error}`;
  if (go) { go.hidden = !(r.ok && r.update); go.textContent = r.ok && r.update ? `Update to ${r.latest}` : "Update now"; }
}
async function checkUpdates(asked) {
  // quietly once a day when Timefill opens; always when you press "Check for updates"
  const KEY = "timefill_update_check";
  let last = 0;
  try { last = +localStorage.getItem(KEY) || 0; } catch { /* private window */ }
  if (!asked && Date.now() - last < 24 * 3600 * 1000) return;
  const status = document.getElementById("upd-status");
  if (asked && status) status.textContent = "checking…";
  const r = await askUpdater("check");
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private window */ }
  if (!asked && !r.ok) return; // no helper: nothing to show unasked
  showUpdate(r);
}
async function runUpdate(btn) {
  btn.disabled = true;
  btn.textContent = "Updating…";
  const r = await askUpdater("update");
  if (!r.ok) { btn.disabled = false; btn.textContent = "Update now"; return toast(`Update failed: ${r.error}`, true); }
  toast(`Updated to Timefill ${r.version}. Restarting…`);
  await chrome.storage.local.set({ reopen_after_update: true });
  setTimeout(() => chrome.runtime.reload(), 800); // the new version starts and opens Timefill again
}

/* --------------------------------------------------------------------- events */
document.addEventListener("click", async (ev) => {
  const pop = document.getElementById("pop");
  if (justDragged) { justDragged = false; return; } // the click that ends a drag
  if (ev.target.closest("#mv-ok")) return submitMove();
  if (ev.target.closest("#mv-cancel")) return closePop();
  if (ev.target.closest("#pop-ok")) return submitPop();
  const lenBtn = ev.target.closest("[data-len]");
  if (lenBtn) return changeAssignLength(+lenBtn.dataset.len);
  if (ev.target.closest("#pl-ok")) return submitPlanPop();
  if (ev.target.closest("#pl-skip")) return skipPlanned();
  if (ev.target.closest("#pl-send")) return sendPlanned(ev.target.closest("#pl-send"));
  if (ev.target.closest("#pop-cancel")) return closePop();
  if (ev.target.closest("#diff-fill") || ev.target.closest("#diff-assign")) return fillDiff(!!ev.target.closest("#diff-assign"));
  if (ev.target.closest("#diff-edit")) { const tg = diffTarget; closePop(); return tg && openLoggedPop(tg, JSON.parse(tg.dataset.wl)); }
  const ign = ev.target.closest("[data-diff-ignore]");
  if (ign) return ignoreDiffs([ign.dataset.diffIgnore]);
  if (ev.target.closest("#diff-ignore-week")) return ignoreDiffs([...document.querySelectorAll("#review tr[data-id]")].map((r) => r.dataset.id));
  if (ev.target.closest("#diff-unignore-week")) return ignoreDiffs(weekDiffIds(), true);
  if (ev.target.closest("[data-ad-reset]")) return saveAllDay({ reset: true });
  const undo = ev.target.closest("[data-ad-undo]");
  if (undo) return saveAllDay({ undo: undo.dataset.adUndo.split(",").filter(Boolean) });
  if (ev.target.closest("#pop")) return;
  const t = ev.target.closest("button, [data-pick], [data-diff], [data-allday], [data-pl], [data-wl]");
  if (pop.style.display === "block" && !t?.dataset.pick && !t?.dataset.pl && !t?.dataset.wl && !t?.dataset.diff && !t?.dataset.allday) closePop();
  if (!t) return;
  if (t.id === "diff-week") return openDiffWeek();
  if (t.dataset.calview) {
    calView = t.dataset.calview;
    try { localStorage.setItem("timefill_cal_view", calView); } catch { /* private window */ }
    return renderStatus(); // redraw from what was read, no reading
  }
  if (t.dataset.allday && !ev.target.closest(".x")) return openAllDayPop(t.dataset.allday, t);
  if (t.dataset.diff && !ev.target.closest("button") && !ev.target.classList.contains("rs")) return openDiffPop(t);
  if (t.dataset.pick && !ev.target.closest("button")) return openPop(t);
  if (t.dataset.pl && !ev.target.closest("button") && !ev.target.classList.contains("rs")) return openPlanPop(t);
  if (t.dataset.wl && !ev.target.closest("button") && !ev.target.classList.contains("rs")) return openLoggedPop(t, JSON.parse(t.dataset.wl));
  if (t.id === "find-go") return findInJira();
  if (t.dataset.pin) return pinProject(t, t.dataset.pin);
  if (t.dataset.unpin) return unpinProject(t.dataset.unpin);
  if (t.id === "refresh") return refreshProjects();
  if (t.dataset.filter) { projFilter = t.dataset.filter; return renderProjects(false); }
  if (t.dataset.week) { weekStart = t.dataset.week === "0" ? mondayOf(new Date()) : addDays(weekStart, 7 * +t.dataset.week); return renderStatus(); }
  if (t.id === "fill-week") return openReview();
  if (t.dataset.fillDay) return openReview(t.dataset.fillDay);
  if (t.dataset.rv === "close") return closeReview();
  if (t.id === "rv-post") return postReview();

  if (t.dataset.delOverride) {
    try { await api(`/api/overrides/${encodeURIComponent(t.dataset.delOverride)}`, { method: "DELETE" }); }
    catch (e) { toast(e.message, true); }
    return renderStatus();
  }
  if (t.id === "save") {
    try { await api("/api/settings", { method: "POST", body: collectSettings() }); toast("Settings saved"); renderSettings(); }
    catch (e) { toast(e.message, true); }
    return;
  }
  if (t.id === "open-outlook") {
    try { await api("/api/outlook/open", { method: "POST", body: { date: iso(weekStart) } }); } catch (e) { toast(e.message, true); }
    return;
  }
  if (t.id === "refresh-status") { t.disabled = true; t.textContent = "Reading…"; return renderStatus(true); }
  if (t.dataset.cfgAdd) {
    const body = document.querySelector(t.dataset.cfgAdd === "role" ? "#cfg-roles tbody" : "#cfg-phases tbody");
    body.insertAdjacentHTML("beforeend", t.dataset.cfgAdd === "role" ? roleRow() : phaseRow({ type: "project" }));
    return;
  }
  if (t.hasAttribute("data-cfg-del")) { t.closest("tr").remove(); return; }
  if (t.hasAttribute("data-cfg-up")) { const tr = t.closest("tr"); tr.previousElementSibling?.before(tr); return; }
  if (t.hasAttribute("data-cfg-down")) { const tr = t.closest("tr"); tr.nextElementSibling?.after(tr); return; }
  if (t.id === "refresh-charts") { t.disabled = true; t.textContent = "Reading…"; return renderCharts(true); }
  if (t.dataset.chart && t.dataset.gran) { chartGran[t.dataset.chart] = t.dataset.gran; return drawCharts(); } // no Jira call

  if (t.id === "diagnose") {
    const pre = document.getElementById("diag");
    pre.hidden = false; pre.textContent = "Reading the Outlook tab…";
    const find = document.getElementById("diag-find")?.value || "";
    try { pre.textContent = JSON.stringify(await api("/api/outlook/diagnose", { method: "POST", body: { find } }), null, 2); }
    catch (e) { pre.textContent = e.message; }
    return;
  }
  if (t.id === "theme-toggle") return toggleTheme();
  if (t.id === "upd-check") return checkUpdates(true);
  if (t.id === "upd-go" || t.id === "upd-bar-go") return runUpdate(t);
  if (t.id === "test-jira" || t.id === "test-cal") {
    const out = document.getElementById(t.id === "test-jira" ? "tj" : "tc");
    out.textContent = "saving & testing…";
    try {
      await api("/api/settings", { method: "POST", body: collectSettings() });
      if (t.id === "test-jira") { const r = await api("/api/test/jira", { method: "POST" }); out.textContent = `✓ connected as ${r.user}`; }
      else { const r = await api("/api/outlook/read", { method: "POST" }); out.textContent = `✓ ${r.events} events read (${r.days[0] || "?"} → ${r.days[r.days.length - 1] || "?"})`; }
    } catch (e) { out.textContent = "✗ " + e.message; }
  }
});

view.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches("select.status")) patchProject(t.dataset.id, { status_mode: t.value });
  if (t.matches("input.kw")) patchProject(t.dataset.id, { keywords: t.value });
  if (t.matches("select.ptype")) patchProject(t.dataset.id, { type_mode: t.value });
  if (t.matches("select.gtype"))
    api(`/api/projects/${encodeURIComponent(t.dataset.id)}`, { method: "PATCH", body: { issue_types: { [t.dataset.key]: t.value } } })
      .then(() => { toast("Saved — counts as " + t.options[t.selectedIndex].text.toLowerCase() + " on the Charts page"); chartsRead = false; }, (e) => toast(e.message, true));
  if (t.matches("input.gkw"))
    api(`/api/projects/${encodeURIComponent(t.dataset.id)}`, { method: "PATCH", body: { issue_keywords: { [t.dataset.key]: t.value } } })
      .then(() => { toast("Saved"); loadIssueOptions(); }, (e) => toast(e.message, true));
});

/* ------------------------------------------------------------------ charts */
// Layout: [calendar: pick a week or month] [hours per project] / [placed vs missing] [type of work].
// Colours come in a fixed, colour-blind-checked order (CSS --c1..--c7); text never takes a series colour.
// Projects take slots 1,2,3,4,6,7 by most hours since "Track from" (a project keeps its colour everywhere);
// vacation always has slot 5; slots a period doesn't use go to that period's next projects; the rest is grey "Other".
const PROJECT_SLOTS = [1, 2, 3, 4, 6, 7];
const projectColor = (i) => (i >= 0 && i < PROJECT_SLOTS.length ? `var(--c${PROJECT_SLOTS[i]})` : "var(--c-other)");
const CAT_COLOR = { presale: "var(--c1)", project: "var(--c2)", install: "var(--c3)", general: "var(--c4)", vacation: "var(--c5)", internal: "var(--c7)", training: "var(--c6)" };
let chartGran = { placed: "week", types: "week" };
let chartSel = null;      // what the calendar selected: { mode: "week" | "month", key } (week key = its Monday)
let calMonth = null; // month shown in the small calendar, "YYYY-MM"
let lastReport = null;

const dOf = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const isoWeekNo = (s) => {
  const d = dOf(s);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Thursday of that week
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
};
const addMonths = (ym, n) => { const d = new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1); return iso(d).slice(0, 7); };
const monthName = (ym) => new Date(+ym.slice(0, 4), +ym.slice(5) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const shortDay = (s) => dOf(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });

let chartsRead = false; // the Charts page has read Jira since Timefill was opened
async function renderCharts(fresh = false) {
  const live = startPage("charts");
  if (!live) return;
  view.innerHTML = `<div class="bar-row"><h1>Charts</h1></div><div class="loading">${fresh ? "Reading your hours from Jira…" : "Loading…"}</div>`;
  let r;
  try { r = await api(`/api/report${fresh ? "?fresh=1" : ""}`); }
  catch (e) { if (live()) view.innerHTML = `<div class="bar-row"><h1>Charts</h1></div><div class="banner err">${esc(e.message)}</div>`; return; }
  if (!live()) return;
  lastReport = r;
  chartsRead = true;
  if (!chartSel) chartSel = { mode: "week", key: iso(mondayOf(dOf(r.today))) };
  if (!calMonth) calMonth = r.today.slice(0, 7);
  drawCharts();
}

const granToggle = (chart) => `<div class="seg" role="group" aria-label="period">${["week", "month"].map((g) =>
  `<button class="chip ${chartGran[chart] === g ? "on" : ""}" data-chart="${chart}" data-gran="${g}">${g === "week" ? "Week" : "Month"}</button>`).join("")}</div>`;
const periodsOf = (gran) => (gran === "week" ? lastReport.weeks : lastReport.months);
const tableView = (head, rows) => `<details class="tview"><summary>Show as table</summary><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

/** The selected week or month as a report period (an empty one if it has no data, e.g. before "Track from"). */
function selectedPeriod() {
  const list = chartSel.mode === "week" ? lastReport.weeks : chartSel.mode === "day" ? lastReport.days : lastReport.months;
  const p = list.find((x) => x.key === chartSel.key);
  if (p) return p;
  const to = chartSel.mode === "day" ? chartSel.key : chartSel.mode === "week" ? iso(addDays(dOf(chartSel.key), 6)) : iso(new Date(+chartSel.key.slice(0, 4), +chartSel.key.slice(5), 0));
  const from = chartSel.mode === "day" ? chartSel.key : chartSel.mode === "week" ? chartSel.key : `${chartSel.key}-01`;
  return { key: chartSel.key, from, to, target: 0, logged: 0, missing: 0, byCategory: {}, byProject: {} };
}
const selectedTitle = (p) => (chartSel.mode === "week" ? `Week ${isoWeekNo(p.from)} · ${shortDay(p.from)} – ${shortDay(p.to)}`
  : chartSel.mode === "day" ? dOf(chartSel.key).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  : monthName(chartSel.key));
const weekOfDay = (date) => iso(mondayOf(dOf(date)));

function drawCharts() {
  const r = lastReport;
  if (!r || currentView() !== "charts") return;
  const since = dOf(r.from).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const read = r.jira_read_at ? new Date(r.jira_read_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  const guess = Math.max(420, Math.floor(((view.clientWidth || 1400) - 16) / 2) - 34); // first draw; then measured
  view.innerHTML = `
    <div class="bar-row"><h1>Charts</h1><span class="muted">your hours in Jira since ${esc(since)}${read ? ` · Jira read ${esc(read)}` : ""}</span>
      <span class="grow"></span><button class="btn" id="refresh-charts" title="Read your hours from Jira again">↻ Refresh</button></div>
    <div class="charts">
      <section class="card chart">${calendarCard(r)}</section>
      <section class="card chart">${pieCard(r)}</section>
      <section class="card chart">${placedCard(r, guess)}</section>
      <section class="card chart">${typesCard(r, guess)}</section>
    </div>`;
  mountBars();
}

/* the bar charts are drawn to the width of their card (and again when the window is resized) */
function mountBars() {
  for (const host of document.querySelectorAll(".bars-host")) {
    const w = host.clientWidth;
    if (!w) continue;
    const chart = host.dataset.bars;
    host.innerHTML = chart === "placed" ? placedBars(w) : typesBars(w);
  }
}
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (lastReport && currentView() === "charts") mountBars(); }, 120);
});

/* 0. small month calendar: click a week row, or the month name; dots = hours in Jira */
function calendarCard(r) {
  const days = Object.fromEntries(r.days.map((d) => [d.date, d]));
  const first = dOf(`${calMonth}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const rows = [];
  for (let wk = mondayOf(first); wk <= last; wk = addDays(wk, 7)) rows.push(iso(wk));
  const dot = (date) => {
    const d = days[date];
    if (!d) return "";
    if (d.target > 0 && date < r.today) return d.logged >= d.target ? `<i class="dot full"></i>` : d.logged > 0 ? `<i class="dot part"></i>` : `<i class="dot miss"></i>`;
    return d.logged > 0 ? `<i class="dot full"></i>` : "";
  };
  const monthSel = chartSel.mode === "month" && chartSel.key === calMonth;
  const p = selectedPeriod();
  const what = chartSel.mode === "day" ? "day" : chartSel.mode;
  return `
    <div class="chart-head"><h2>Pick a day, week or month</h2><span class="grow"></span>
      <button class="btn tiny" data-sel-today title="the current week">This week</button></div>
    <div class="cal-split">
    <div class="minical">
      <div class="mc-head">
        <button class="btn tiny" data-cal-step="-1" aria-label="previous month">‹</button>
        <button class="mc-title ${monthSel ? "on" : ""}" data-sel-month="${calMonth}" title="select the whole month">${esc(monthName(calMonth))}</button>
        <button class="btn tiny" data-cal-step="1" aria-label="next month">›</button>
      </div>
      <table class="mc"><thead><tr><th class="wn">Wk</th>${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<th>${x}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((mon) => {
          const on = chartSel.mode === "week" && chartSel.key === mon;
          return `<tr class="wk ${on ? "on" : ""}">
            <td class="wn" data-sel-week="${mon}" title="select week ${isoWeekNo(mon)}">${isoWeekNo(mon)}</td>${[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const date = iso(addDays(dOf(mon), i));
              const dayClass = [date.slice(0, 7) !== calMonth ? "out" : "", date === r.today ? "today" : "", date < r.from ? "pre" : "",
                monthSel && date.slice(0, 7) === calMonth ? "msel" : "", chartSel.mode === "day" && chartSel.key === date ? "dsel" : ""].join(" ");
              return `<td class="day ${dayClass}" data-sel-day="${date}" title="show ${esc(shortDay(date))} only"><span>${+date.slice(8)}</span>${date >= r.from ? dot(date) : ""}</td>`;
            }).join("")}</tr>`;
        }).join("")}</tbody></table>
    </div>
    <div class="sel-side">
      <div class="sel-kind">Selected ${esc(what)}</div>
      <div class="sel-title">${esc(selectedTitle(p))}</div>
      <dl class="sel-nums">
        <div><dt>Placed in Jira</dt><dd>${esc(hrs(p.logged))}</dd></div>
        <div><dt>Missing</dt><dd>${esc(hrs(p.missing))}</dd></div>
        <div><dt>Vacation</dt><dd>${esc(hrs(p.byCategory.vacation || 0))}</dd></div>
        <div><dt>Expected</dt><dd>${esc(hrs(p.target))}</dd></div>
      </dl>
      <div class="mc-legend small muted"><span><i class="dot full"></i>all hours in Jira</span><span><i class="dot part"></i>partly</span><span><i class="dot miss"></i>nothing in Jira</span></div>
      <p class="small muted how">Click a <b>week number</b> for that week, a <b>day</b> for that day only, or the <b>month name</b> for the whole month. The charts follow your choice.</p>
    </div>
    </div>`;
}

/* 1. hours per project (incl. vacation) for the selected week or month */
function pieCard(r) {
  const p = selectedPeriod();
  const slices = [], extra = [], used = new Set();
  let other = 0;
  // your main projects keep their colour everywhere; colours they don't use in this period go to this period's
  // next biggest projects, so as many projects as possible are shown on their own (and "Other" stays small)
  for (const [name, m] of Object.entries(p.byProject).sort((a, b) => b[1] - a[1])) {
    const i = r.projectOrder.indexOf(name);
    if (i >= 0 && i < PROJECT_SLOTS.length) { slices.push({ name, m, color: projectColor(i) }); used.add(PROJECT_SLOTS[i]); }
    else extra.push([name, m]);
  }
  const free = PROJECT_SLOTS.filter((sl) => !used.has(sl));
  for (const [name, m] of extra) { const sl = free.shift(); if (sl) slices.push({ name, m, color: `var(--c${sl})` }); else other += m; }
  slices.sort((a, b) => b.m - a.m);
  if (other) slices.push({ name: "Other projects", m: other, color: "var(--c-other)" });
  const vac = p.byCategory.vacation || 0;
  if (vac) slices.push({ name: "Vacation / absence", m: vac, color: CAT_COLOR.vacation });
  const total = slices.reduce((a, s) => a + s.m, 0);
  const R = 78, W = 30, C = 100;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = (s.m / total) * Math.PI * 2, gap = slices.length > 1 ? Math.min(0.03, sweep / 3) : 0, a1 = a0 + sweep;
    const tip = esc(`${s.name}\n${hrs(s.m)} · ${Math.round((s.m / total) * 100)}%`);
    const mark = slices.length === 1 ? `<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${s.color}" stroke-width="${W}" data-tip="${tip}"/>`
      : `<path d="${arc(C, C, R, a0 + gap / 2, a1 - gap / 2)}" fill="none" stroke="${s.color}" stroke-width="${W}" data-tip="${tip}"/>`;
    a0 = a1;
    return mark;
  }).join("");
  return `
    <div class="chart-head"><h2>Hours per project</h2><span class="grow"></span>
      <button class="btn tiny" data-sel-step="-1" aria-label="previous">‹</button>
      <span class="sel-chip">${esc(selectedTitle(p))}</span>
      <button class="btn tiny" data-sel-step="1" aria-label="next">›</button></div>
    ${total ? `<div class="pie-wrap">
      <svg class="donut" viewBox="0 0 200 200" role="img" aria-label="Hours per project, ${esc(selectedTitle(p))}">
        ${arcs}
        <text x="100" y="96" text-anchor="middle" class="donut-total">${esc(hrs(total))}</text>
        <text x="100" y="116" text-anchor="middle" class="donut-sub">in Jira</text>
      </svg>
      <ul class="pie-list">${slices.map((s) => `<li data-tip="${esc(`${s.name}\n${hrs(s.m)}`)}"><i style="background:${s.color}"></i><span class="nm">${esc(s.name)}</span>
        <b>${esc(hrs(s.m))}</b><span class="muted">${Math.round((s.m / total) * 100)}%</span></li>`).join("")}</ul>
    </div>` : `<p class="muted empty">No hours in Jira for this ${chartSel.mode}.</p>`}
    ${total ? tableView(["Project", "Hours", "Share"], slices.map((s) => [s.name, hrs(s.m), `${Math.round((s.m / total) * 100)}%`])) : ""}`;
}

function arc(cx, cy, r, a0, a1) {
  const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
}

/* 2. placed vs missing */
const placedSeries = () => [
  { id: "placed", label: "Placed in Jira", color: "var(--c1)", value: (p) => p.logged },
  { id: "missing", label: "Missing", color: "var(--c2)", hatch: true, value: (p) => p.missing },
];
const placedBars = (w) => stackedBars(periodsOf(chartGran.placed), placedSeries(), chartGran.placed, w);
function placedCard(r, w) {
  const gran = chartGran.placed, periods = periodsOf(gran), series = placedSeries();
  return `
    <div class="chart-head"><h2>Placed and missing hours</h2><span class="grow"></span>${granToggle("placed")}</div>
    <div class="kpis"><div><b>${esc(hrs(periods.reduce((a, p) => a + p.logged, 0)))}</b><span>placed in Jira</span></div>
      <div><b>${esc(hrs(periods.reduce((a, p) => a + p.missing, 0)))}</b><span>missing</span></div></div>
    ${legend(series)}
    <div class="bars-host" data-bars="placed">${placedBars(w)}</div>
    <p class="small muted">Missing = expected hours not in Jira, for finished days. Click a bar to select that ${gran}.</p>
    ${tableView([gran === "week" ? "Week of" : "Month", "Placed", "Missing", "Expected"], periods.map((p) => [p.label, hrs(p.logged), hrs(p.missing), hrs(p.target)]))}`;
}

/* 3. type of work */
const typeSeries = () => lastReport.categories.map((c) => ({ id: c.id, label: c.label, color: CAT_COLOR[c.id], value: (p) => p.byCategory[c.id] || 0 }));
const typesBars = (w) => stackedBars(periodsOf(chartGran.types), typeSeries(), chartGran.types, w);
function typesCard(r, w) {
  const gran = chartGran.types, periods = periodsOf(gran), series = typeSeries();
  return `
    <div class="chart-head"><h2>Time by type of work</h2><span class="grow"></span>${granToggle("types")}</div>
    <div class="kpis">${series.map((s) => `<div><b>${esc(hrs(periods.reduce((a, p) => a + s.value(p), 0)))}</b><span>${esc(s.label)}</span></div>`).join("")}</div>
    ${legend(series)}
    <div class="bars-host" data-bars="types">${typesBars(w)}</div>
    <p class="small muted">Pre-sale = INIT + SDF · Project = EXEC · Installation = COMM · Internal = internal projects (each issue can be set otherwise in Projects, e.g. Training) · General = issues outside your projects.</p>
    ${tableView([gran === "week" ? "Week of" : "Month", ...series.map((s) => s.label), "Total"],
      periods.map((p) => [p.label, ...series.map((s) => hrs(s.value(p))), hrs(series.reduce((a, s) => a + s.value(p), 0))]))}`;
}

const legend = (series) => `<div class="legend chart-legend">${series.map((s) =>
  `<span><i class="${s.hatch ? "hatch" : ""}" style="--sw:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>`;

/** Is bar `p` (of granularity `gran`) part of what the calendar selected? A selected month highlights its weeks;
    a selected week highlights its month. */
function isSelectedBar(p, gran) {
  if (!chartSel) return false;
  if (chartSel.mode === gran) return p.key === chartSel.key;
  if (chartSel.mode === "day") return gran === "week" ? p.key === weekOfDay(chartSel.key) : p.key === chartSel.key.slice(0, 7);
  if (gran === "month") return p.key === iso(addDays(dOf(chartSel.key), 3)).slice(0, 7); // the week's Thursday decides
  return iso(addDays(dOf(p.key), 3)).slice(0, 7) === chartSel.key;
}

/** Vertical stacked bars sized to `width`; 2px gaps, rounded top, hover for numbers, click to select. */
function stackedBars(periods, series, gran, width) {
  if (!periods.length) return `<p class="muted">No data yet.</p>`;
  const totalOf = (p) => series.reduce((a, s) => a + s.value(p), 0);
  const maxH = Math.max(1, ...periods.map((p) => totalOf(p) / 60));
  const step = [2, 4, 5, 10, 20, 40, 50, 100, 200].find((x) => maxH / x <= 5) || 200;
  const top = Math.ceil(maxH / step) * step;
  const L = 40, T = 10, H = 230, B = 30, Wd = Math.max(240, Math.floor(width));
  const slot = (Wd - L - 8) / periods.length;
  const barW = Math.max(8, Math.min(64, slot * 0.6));
  const y = (m) => T + H - (m / 60 / top) * H;
  let grid = "";
  for (let v = 0; v <= top; v += step)
    grid += `<line x1="${L}" x2="${Wd - 4}" y1="${y(v * 60)}" y2="${y(v * 60)}" class="gl"/><text x="${L - 6}" y="${y(v * 60) + 4}" text-anchor="end" class="ax">${v}h</text>`;
  const every = Math.ceil(36 / slot); // thin out x labels when bars are narrow
  const bars = periods.map((p, i) => {
    const x0 = L + i * slot, x = x0 + (slot - barW) / 2;
    let base = T + H;
    const visible = series.filter((s) => s.value(p) > 0);
    const segs = visible.map((s, k) => {
      const h = (s.value(p) / 60 / top) * H, h2 = Math.max(0, h - (k > 0 ? 2 : 0)), yy = base - h;
      const fill = s.hatch ? `url(#hatch-${s.id})` : s.color;
      base = yy;
      return k === visible.length - 1 ? `<path d="${topRounded(x, yy, barW, h2, 4)}" fill="${fill}"/>` : `<rect x="${x}" y="${yy}" width="${barW}" height="${h2}" fill="${fill}"/>`;
    }).join("");
    const on = isSelectedBar(p, gran);
    const tip = `${gran === "week" ? `Week ${isoWeekNo(p.from)} · ${p.label}` : p.label}\n${series.map((s) => `${s.label}: ${hrs(s.value(p))}`).join("\n")}\n(click to select)`;
    const label = gran === "week" ? p.label : p.label.replace(/\s\d{4}$/, "");
    return `${on ? `<rect x="${x0 + 2}" y="${T}" width="${slot - 4}" height="${H}" rx="6" class="selband"/>` : ""}${segs}
      <rect x="${x0}" y="${T}" width="${slot}" height="${H + B}" class="hit" data-tip="${esc(tip)}" data-sel-period="${gran}|${p.key}"/>
      ${i % every === 0 || on ? `<text x="${x0 + slot / 2}" y="${T + H + 18}" text-anchor="middle" class="ax ${on ? "on" : ""}">${esc(label)}</text>` : ""}`;
  }).join("");
  const hatches = series.filter((s) => s.hatch).map((s) => `<pattern id="hatch-${s.id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" fill="${s.color}" opacity=".35"/><rect width="3" height="6" fill="${s.color}"/></pattern>`).join("");
  return `<svg class="bars" viewBox="0 0 ${Wd} ${T + H + B}" width="${Wd}" height="${T + H + B}" role="img" aria-label="${esc(series.map((s) => s.label).join(", "))} per ${gran}">
    <defs>${hatches}</defs>${grid}${bars}</svg>`;
}
const topRounded = (x, y, w, h, r) => {
  r = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
};

/* selection: calendar rows, month name, ‹ ›, "This week", bars */
function stepSelection(n) {
  if (chartSel.mode === "week") chartSel = { mode: "week", key: iso(addDays(dOf(chartSel.key), 7 * n)) };
  else if (chartSel.mode === "day") chartSel = { mode: "day", key: iso(addDays(dOf(chartSel.key), n)) };
  else chartSel = { mode: "month", key: addMonths(chartSel.key, n) };
  calMonth = chartSel.mode === "week" ? iso(addDays(dOf(chartSel.key), 3)).slice(0, 7) : chartSel.key.slice(0, 7); // keep the calendar on it
  drawCharts();
}
view.addEventListener("click", (ev) => {
  if (currentView() !== "charts" || !lastReport) return;
  const t = ev.target.closest?.("[data-sel-week],[data-sel-day],[data-sel-month],[data-sel-period],[data-cal-step],[data-sel-today],[data-sel-step]");
  if (!t) return;
  if (t.dataset.selWeek) chartSel = { mode: "week", key: t.dataset.selWeek };
  else if (t.dataset.selDay) chartSel = { mode: "day", key: t.dataset.selDay };
  else if (t.dataset.selMonth) chartSel = { mode: "month", key: t.dataset.selMonth };
  else if (t.dataset.selPeriod) {
    const [mode, key] = t.dataset.selPeriod.split("|");
    chartSel = { mode, key };
    calMonth = mode === "week" ? iso(addDays(dOf(key), 3)).slice(0, 7) : key;
  } else if (t.dataset.calStep) calMonth = addMonths(calMonth, +t.dataset.calStep);
  else if (t.hasAttribute("data-sel-today")) { chartSel = { mode: "week", key: iso(mondayOf(dOf(lastReport.today))) }; calMonth = lastReport.today.slice(0, 7); }
  else if (t.dataset.selStep) return stepSelection(+t.dataset.selStep);
  drawCharts();
});

/* tooltip for chart marks */
const tipEl = document.getElementById("tip");
view.addEventListener("mouseover", (ev) => {
  const t = ev.target.closest?.("[data-tip]");
  if (!t || !tipEl) return;
  tipEl.textContent = t.getAttribute("data-tip");
  tipEl.style.display = "block";
});
view.addEventListener("mousemove", (ev) => {
  if (!tipEl || tipEl.style.display !== "block") return;
  tipEl.style.left = `${Math.min(ev.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8)}px`;
  tipEl.style.top = `${ev.clientY + 14}px`;
});
view.addEventListener("mouseout", (ev) => { if (tipEl && ev.target.closest?.("[data-tip]")) tipEl.style.display = "none"; });

/* --------------------------------------------------------------------- router */
// opening the Status page reads Outlook + Jira; everything else on it redraws from what was read
// Charts: Jira is read once per app session; after that only on Refresh.
const views = { projects: renderProjects, status: () => renderStatus(true), charts: () => renderCharts(!chartsRead), settings: renderSettings };
function route() {
  const name = currentView();
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("on", a.dataset.view === name));
  views[name]();
}
window.addEventListener("hashchange", route);
document.getElementById("review").addEventListener("change", (ev) => {
  // "select all": every worklog that has already happened (later ones stay unticked); posting still needs "Post"
  if (ev.target.id === "rv-all-box")
    document.querySelectorAll("#review .rv-ok:not(.fut):not(:disabled)").forEach((c) => (c.checked = ev.target.checked));
  reviewSelection();
});
document.getElementById("review").addEventListener("mousedown", (ev) => { if (ev.target.id === "review") closeReview(); });
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.id === "find-q") { ev.preventDefault(); return findInJira(); }
  if (document.getElementById("pop").style.display !== "block") return;
  if (ev.key === "Escape") closePop();
  if (ev.key === "Enter" && ev.target.id === "pk-phase" && document.getElementById("pop-ok")) { ev.preventDefault(); submitPop(); }
  if (ev.key === "Enter" && ["pk-phase", "pl-start", "pl-end"].includes(ev.target.id) && document.getElementById("pl-ok")) { ev.preventDefault(); submitPlanPop(); }
  if (ev.key === "Enter" && ev.target.id === "mv-ok") { ev.preventDefault(); submitMove(); }
});
// Anything that goes wrong is shown on the page and logged, never a silent blank page.
const showCrash = (e) => {
  console.error("[Timefill]", e);
  try { toast(`Something went wrong: ${e?.message || e}. Details are in the console (F12).`, true); } catch { /* page not ready */ }
};
window.addEventListener("error", (ev) => showCrash(ev.error || ev.message));
window.addEventListener("unhandledrejection", (ev) => showCrash(ev.reason));
loadIssueOptions();
watchOutlookTabs().catch(() => {}); // the Outlook tabs are read only while this page is open
checkUpdates(false);
try { route(); } catch (e) {
  showCrash(e);
  view.innerHTML = `<div class="banner err">Timefill could not open this page: ${esc(e.message)}. Details are in the console (F12).</div>`;
}
