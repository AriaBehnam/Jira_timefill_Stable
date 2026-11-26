// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
//
// Project model
//
//   project = a Jira EPIC (each epic is its own project)
//          or a GROUP of standalone issues (no epic) sharing the same project code
//   phases  = the epic's children (JQL "parent = <epic>", no assignee filter)
//             + standalone issues with exactly the epic's code
//   phase label = the summary text after the project name, e.g. "INIT · MGMT" in "26.001.P01 Big Job · INIT · MGMT"
//   code    = "xx.xxx…" at the start of the summary (e.g. 26.001.P01), else the project code field
//   EXTERNAL project = customer project with a code. Events: keyword + role word (E/M) -> phase.
//   INTERNAL project = no code (e.g. an "internal activities" epic), or switched to Internal by hand.
//             Each of its issues gets its own calendar keywords (no role word needed).
//   Two epics with the SAME code (e.g. a feasibility-study epic and the project epic of the same job) are one
//   project: the epic that is further along in the phases names it, the other's phases are kept in it.
//
// Phases and roles (their names in Jira, what Timefill shows, lifecycle order) come from Settings → Phases &
// roles (config.js). Project status is detected from the phase names, never a separate "Active" state:
//   Auto = the latest phase (not Done) where you logged hours or where work is in progress;
//   Closed when the epic or all phases are Done.

import { phasesOf, rolesOf } from "./config.js";

/** Bump when the stored project list must be rebuilt from Jira after an update. */
export const MODEL_VERSION = 5;
export const TYPE_MODES = ["auto", "external", "internal"];
// Statuses saved by earlier versions -> phase token
const LEGACY_STATUS = { "pre-sale": "INIT", project: "EXEC", commissioning: "COMM", active: "auto" };

/* phases and roles from Settings (configure() is called with the settings before anything else is used) */
export let ROLES = [];
export let PHASE_NAMES = {};
let ORDER = [], PHASE_TYPE = {}, PHASE_RE = /(?!)/g, ROLE_RE = /(?!)/g;
const reAlt = (tokens) => tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|");
const tokenRe = (tokens) => (tokens.length ? new RegExp(`(?<![A-Za-z0-9])(${reAlt(tokens)})(?![A-Za-z0-9])`, "gi") : /(?!)/g);
export function configure(settings = {}) {
  const phases = phasesOf(settings), roles = rolesOf(settings);
  ORDER = phases.map((p) => p.token);
  PHASE_NAMES = Object.fromEntries(phases.map((p) => [p.token, p.name]));
  PHASE_TYPE = Object.fromEntries(phases.map((p) => [p.token, p.type]));
  PHASE_RE = tokenRe(ORDER);
  ROLES = roles.map((r) => r.token);
  ROLE_RE = tokenRe(ROLES);
}
configure(); // defaults until the settings are loaded
/** The "type of work" (presale | project | install | general) a phase token counts as, or null. */
export const phaseType = (token) => PHASE_TYPE[String(token || "").toUpperCase()] || null;
/** Phase tokens of the same type as `token` (e.g. both pre-sale phases), lifecycle order. */
export const sameTypePhases = (token) => ORDER.filter((t) => PHASE_TYPE[t] && PHASE_TYPE[t] === PHASE_TYPE[token]);

const CODE_RE = /^\s*(\d{2}\.\d{3}(?:\.[A-Za-z0-9]+)?)(?![\w.])/;
const SEG_RE = /\s*[·•|]\s*/; // separators between name and phase parts of a summary
const SEP = " \t-·•|/_:,";

const stripSep = (s) => {
  let a = 0, b = s.length;
  while (a < b && SEP.includes(s[a])) a++;
  while (b > a && SEP.includes(s[b - 1])) b--;
  return s.slice(a, b);
};
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const statusName = (s) => (s === "closed" ? "Closed" : PHASE_NAMES[s] || s);

/** Old-style parse kept for summaries with phase + role tokens: {name, code, phase, role} or null. */
export function parseSummary(summary) {
  const ph = [...summary.matchAll(PHASE_RE)];
  const ro = [...summary.matchAll(ROLE_RE)];
  if (!ph.length || !ro.length) return null;
  const p = ph[ph.length - 1], r = ro[ro.length - 1];
  const name = stripSep(summary.slice(0, Math.min(p.index, r.index)));
  if (!name) return null;
  const m = CODE_RE.exec(name);
  return { name, code: m ? m[1] : "", phase: p[1].toUpperCase(), role: r[1].toUpperCase() };
}

/** "26.001.P01 Big Job · INIT · MGMT" with name "26.001.P01 Big Job" -> "INIT · MGMT" */
export function phaseLabel(summary, name) {
  const s = clean(summary), n = clean(name);
  if (n && s.length > n.length && s.toLowerCase().startsWith(n.toLowerCase())) return stripSep(s.slice(n.length)).split(SEG_RE).filter(Boolean).join(" · ");
  if (n && s.toLowerCase() === n.toLowerCase()) return "";
  const segs = s.split(SEG_RE).filter(Boolean);
  if (segs.length >= 2) return segs.slice(1).join(" · ");
  return s;
}

/** Phase and role tokens of a label: "INIT · MGMT" -> {phase:"INIT", role:"MGMT"}, "SDF · SD" -> {phase:"SDF", role:"SD"} */
export function labelTokens(label) {
  const ro = [...label.matchAll(ROLE_RE)];
  const role = ro.length ? ro[ro.length - 1][1].toUpperCase() : null;
  const ph = [...label.matchAll(PHASE_RE)];
  let phase = ph.length ? ph[0][1].toUpperCase() : null;
  if (!phase) {
    const other = label.split(SEG_RE).map(clean).find((x) => x && !ROLES.includes(x.toUpperCase()));
    if (other && other.length <= 12 && !/\s/.test(other)) phase = other.toUpperCase();
  }
  return { phase, role };
}

/* ----------------------------------------------------------- internal / external */
/** Internal = no project code (auto), or chosen by hand. `general` is the name used by 1.5.x. */
export const autoInternal = (p) => (p.auto_internal ?? p.general ?? false) === true; // set on every refresh
export const isInternal = (p) => (p.type_mode === "internal" ? true : p.type_mode === "external" ? false : autoInternal(p));

/* --------------------------------------------------------------- project status */
const isDone = (i) => i.status_category === "done";
const keyNum = (k) => +String(k).split("-")[1] || 0;
const orderOf = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);

/** Phase tokens present in the project, lifecycle order: e.g. ["SDF"] or ["INIT","EXEC","COMM"]. */
export function phaseTokens(project) {
  return [...new Set(project.issues.map((i) => i.phase).filter(Boolean))].sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));
}
export const allowedStatuses = (project) => [...phaseTokens(project), "closed"];

export function autoStatus(project) {
  const issues = project.issues;
  if (project.epic && isDone(project.epic)) return "closed";
  if (issues.length && issues.every(isDone)) return "closed";
  const tokens = phaseTokens(project);
  if (!tokens.length) return "open"; // phases without recognisable names
  const of = (t) => issues.filter((i) => i.phase === t);
  // latest phase (not Done) where you logged hours or where work is in progress
  for (const t of [...tokens].reverse())
    if (of(t).some((i) => !isDone(i) && ((i.my_minutes || 0) > 0 || i.status_category === "indeterminate"))) return t;
  for (const t of tokens) // otherwise the first phase that isn't finished
    if (of(t).some((i) => !isDone(i))) return t;
  return tokens[0];
}

export function effectiveStatus(project) {
  let mode = project.status_mode || "auto";
  mode = LEGACY_STATUS[mode] || mode;
  return mode !== "auto" && allowedStatuses(project).includes(mode) ? mode : autoStatus(project);
}

/**
 * [issueKey, null] or [null, reason]: the phase to log on for an event with this role (MGMT/SD).
 * `phases`: phase tokens the event title asks for, in order of preference (e.g. ["COMM"] for "installation"),
 * which win over the project's status. Null = use the status.
 */
export function issueFor(project, role, phases = null) {
  const status = effectiveStatus(project);
  if (status === "closed") return [null, "project is closed"];
  if (phases?.length) {
    for (const ph of phases) {
      const inPhase = project.issues.filter((i) => i.phase === ph);
      const hit = inPhase.find((i) => i.role === role) || (inPhase.length === 1 && !inPhase[0].role ? inPhase[0] : null);
      if (hit) return [hit.key, null];
    }
    return [null, `the title asks for ${phases[0]}, but there is no ${phases[0]} · ${role} phase in Jira`];
  }
  if (status !== "open") {
    const inPhase = project.issues.filter((i) => i.phase === status);
    const hit = inPhase.find((i) => i.role === role);
    if (hit) return [hit.key, null];
    if (inPhase.length === 1 && !inPhase[0].role) return [inPhase[0].key, null];
    return [null, `no ${status} · ${role} phase in Jira`];
  }
  const open = project.issues.filter((i) => !isDone(i));
  const pool = open.length ? open : project.issues;
  const byRole = pool.filter((i) => i.role === role);
  if (byRole.length)
    return [[...byRole].sort((a, b) => (b.status_category === "indeterminate") - (a.status_category === "indeterminate") || keyNum(a.key) - keyNum(b.key))[0].key, null];
  if (pool.length === 1) return [pool[0].key, null];
  return [null, `no open ${role} phase`];
}

/* ------------------------------------------------------------------- refresh */
// How an issue got into the list. Lower number wins when an issue is found more than one way.
const VIA_RANK = { assigned: 0, worked: 1, kept: 2, related: 3 };

/** The worked-on query with {track_from} filled in ("" when switched off). */
export function workedJql(settings) {
  const q = String(settings.worked_jql || "").trim();
  if (!q) return "";
  return q.replaceAll("{track_from}", settings.track_from || "1970-01-01");
}

const isEpicType = (t) => !!t && (t.hierarchyLevel === 1 || /^(epic|epica)$/i.test(t.name || ""));
const fieldValue = (v) => {
  if (v == null) return "";
  if (Array.isArray(v)) return fieldValue(v[0]);
  if (typeof v === "object") return clean(v.value ?? v.name ?? "");
  return clean(v);
};
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const jqlStr = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const isConfigured = (p) => p.pinned || (p.keywords || []).length || (p.status_mode && p.status_mode !== "auto") || (p.type_mode && p.type_mode !== "auto") || p.issues.some((i) => (i.keywords || []).length || i.work_type);

/** The project code custom field (e.g. "Project code"): {id, jql, type} or null. */
async function findCodeField(jira, settings, report) {
  const want = clean(settings.studio_field).toLowerCase();
  if (!want) return null;
  try {
    const f = (await jira.fieldsList()).find((x) => clean(x.name).toLowerCase() === want || x.id === settings.studio_field);
    if (!f) { report.errors.push(`Field “${settings.studio_field}” not found in Jira - using only the code at the start of the summary.`); return null; }
    const num = /^customfield_(\d+)$/.exec(f.id);
    return { id: f.id, jql: num ? `cf[${num[1]}]` : jqlStr(f.name), type: f.schema?.type || "string" };
  } catch (e) {
    report.errors.push(`Could not read the Jira field list (${e.message}) - using only the summary code.`);
    return null;
  }
}

/** Pull projects from Jira and rebuild the list, keeping your keywords and manual statuses. Returns new names. */
export async function refresh(jira, settings, data) {
  const me = await jira.myself();
  const acct = me.accountId;
  const vacation = clean(settings.vacation_issue).toUpperCase();
  const report = { at: null, assigned: 0, worked: 0, worked_keys: [], related: 0, epics: 0, groups: 0, internal: 0, merged: 0, studio_field: null, worked_jql: "", errors: [] };
  const field = await findCodeField(jira, settings, report);
  report.studio_field = field?.id || null;
  const FIELDS = ["summary", "status", "issuetype", "parent", ...(field ? [field.id] : [])];
  // summary code first (26.020.P02 is more precise than a shared study code 26.020), then the field
  const codeOf = (raw) => {
    const f = raw.fields || {};
    return (CODE_RE.exec(f.summary || "") || [])[1] || (field && fieldValue(f[field.id])) || "";
  };

  /* 1. discover: assigned to you, worked on since "track from", and projects you configured */
  const via = {}, raws = {};
  const note = (r, how) => {
    if (r.key.toUpperCase() === vacation) return false;
    raws[r.key] = r;
    if (!(r.key in via) || VIA_RANK[how] < VIA_RANK[via[r.key]]) via[r.key] = how;
    return true;
  };
  for (const r of await jira.search(settings.project_jql, FIELDS)) if (note(r, "assigned")) report.assigned++;
  const wq = workedJql(settings);
  report.worked_jql = wq;
  if (wq) {
    try { for (const r of await jira.search(wq, FIELDS)) if (note(r, "worked")) report.worked_keys.push(r.key); }
    catch (e) { report.errors.push(`“Issues I worked on” query failed: ${e.message}`); }
    report.worked = report.worked_keys.length;
  }
  const old = data.projects || [];
  // projects you added with "Find a project" (pinned) and projects you configured stay in the list
  const pinned = new Set(data.pinned || []);
  const keepKeys = [...new Set([...pinned, ...old.filter(isConfigured).flatMap((p) => [...p.issues.map((i) => i.key), ...(p.epic ? [p.epic.key] : [])])])].filter((k) => !(k in raws));
  for (const c of chunks(keepKeys, 80)) {
    try { for (const r of await jira.search(`key in (${c.join(", ")})`, FIELDS)) note(r, "kept"); }
    catch (e) { report.errors.push(`Re-reading your configured projects failed: ${e.message}`); }
  }

  /* 2. epic or standalone */
  const epics = {}; // epicKey -> raw (or the parent stub)
  const standalone = [];
  for (const r of Object.values(raws)) {
    const f = r.fields || {};
    if (isEpicType(f.issuetype)) epics[r.key] = r;
    else if (f.parent && isEpicType(f.parent.fields?.issuetype)) epics[f.parent.key] ||= f.parent;
    else standalone.push(r);
  }

  /* 3. all children of those epics, no assignee filter */
  const children = {}; // epicKey -> [raw]
  for (const c of chunks(Object.keys(epics), 50)) {
    try {
      for (const r of await jira.search(`parent in (${c.join(", ")}) ORDER BY key`, FIELDS)) {
        const pk = r.fields?.parent?.key;
        if (!pk || r.key.toUpperCase() === vacation) continue;
        (children[pk] ||= []).push(r);
        raws[r.key] ||= r;
        if (!(r.key in via)) { via[r.key] = "related"; report.related++; }
      }
    } catch (e) { report.errors.push(`Reading the phases of your epics failed: ${e.message}`); }
  }

  /* 4. build projects: one per epic; standalone issues by code (or alone) */
  const now = new Date().toISOString().slice(0, 19);
  const built = {};
  const info = (r, project) => {
    const f = r.fields || {};
    const st = f.status || {};
    const label = phaseLabel(f.summary || "", project.name) || "main";
    return { key: r.key, summary: clean(f.summary), label, ...labelTokens(label), status: st.name || "", status_category: st.statusCategory?.key || "", via: via[r.key] || "related" };
  };
  const projectFor = (id, base) => (built[id] ||= { id, keywords: [], status_mode: "auto", issues: [], ...base });
  const addPhase = (p, r) => { if (!p.issues.some((i) => i.key === r.key)) p.issues.push(info(r, p)); };
  const epicByCode = {};

  for (const [ek, er] of Object.entries(epics)) {
    const code = codeOf(er);
    const ef = er.fields || {};
    const p = projectFor("e-" + ek.toLowerCase(), { kind: "epic", code, auto_internal: !code, name: clean(ef.summary) || ek });
    p.epic = { key: ek, summary: clean(ef.summary), status: ef.status?.name || "", status_category: ef.status?.statusCategory?.key || "", via: via[ek] || "related" };
    const kids = children[ek] || [];
    for (const r of kids) addPhase(p, r);
    if (!kids.length) addPhase(p, er); // an epic without children is its own only phase
  }
  // Epics of the same job are one project, kept under the MORE COMPLETE epic (later phases, more phases);
  // the other epic's phases and hours join it.
  //  - same code (e.g. two epics "26.010"), or
  //  - a study/feasibility epic with only the base code "26.006" + the project epic "26.006.P06".
  //    Project epics with different numbers (26.020.P01 / 26.020.P02) stay separate; if several share
  //    the base, the study epic joins the most complete one.
  const lateness = (p) => Math.max(-1, ...p.issues.map((i) => (i.phase ? orderOf(i.phase) : -1)));
  // further along first: detected status (COMM > EXEC > INIT > SDF; a closed epic counts as its latest phase),
  // then latest phase present, longer code, more phases, newer epic
  const progress = (p) => { const st = autoStatus(p); return st === "closed" ? lateness(p) : st === "open" ? -1 : orderOf(st); };
  const completeness = (a, b) => progress(b) - progress(a) || lateness(b) - lateness(a) || b.code.length - a.code.length ||
    b.issues.length - a.issues.length || keyNum(b.epic.key) - keyNum(a.epic.key);
  const mergeInto = (keep, o) => {
    for (const i of o.issues) if (!keep.issues.some((x) => x.key === i.key)) keep.issues.push(i);
    (keep.merged_epics ||= []).push(o.epic, ...(o.merged_epics || []));
    delete built[o.id];
    epicByCode[o.code.toLowerCase()] = keep;
  };
  const epicsWithCode = () => Object.values(built).filter((p) => p.kind === "epic" && p.code);
  const sameCode = {};
  for (const p of epicsWithCode()) (sameCode[p.code.toLowerCase()] ||= []).push(p);
  for (const group of Object.values(sameCode)) {
    group.sort(completeness);
    const [keep, ...rest] = group;
    rest.forEach((o) => mergeInto(keep, o));
    epicByCode[keep.code.toLowerCase()] = keep;
  }
  const baseOf = (code) => (/^(\d{2}\.\d{3})/.exec(code) || [])[1] || "";
  const sameBase = {};
  for (const p of epicsWithCode()) if (baseOf(p.code)) (sameBase[baseOf(p.code)] ||= []).push(p);
  for (const [base, group] of Object.entries(sameBase)) {
    const study = group.filter((p) => p.code.toLowerCase() === base.toLowerCase());
    const projects = group.filter((p) => p.code.toLowerCase() !== base.toLowerCase()).sort(completeness);
    if (study.length && projects.length) study.forEach((o) => mergeInto(projects[0], o));
  }
  for (const r of standalone) {
    const code = codeOf(r);
    const summary = clean(r.fields?.summary);
    const p = code
      ? epicByCode[code.toLowerCase()] || projectFor("c-" + slug(code), { kind: "group", code, auto_internal: false, name: summary.split(SEG_RE)[0] || code })
      : projectFor("i-" + r.key.toLowerCase(), { kind: "single", code: "", auto_internal: true, name: summary || r.key });
    addPhase(p, r);
  }

  /* 5. standalone issues with the same code as an open (or worked-on) coded project */
  const workedOn = (p) => p.issues.some((i) => i.via === "worked") || p.epic?.via === "worked";
  const lookups = Object.values(built).filter((p) => p.code && (autoStatus(p) !== "closed" || workedOn(p)));
  for (const c of chunks(lookups, 20)) {
    const jiraProjects = [...new Set(c.flatMap((p) => p.issues.map((i) => i.key.split("-")[0])))];
    const byCode = c.map((p) => {
      const conds = [`summary ~ ${jqlStr(`"${p.code}"`)}`];
      if (field) conds.push(field.type === "string" ? `${field.jql} ~ ${jqlStr(`"${p.code}"`)}` : `${field.jql} = ${jqlStr(p.code)}`);
      return conds.join(" OR ");
    });
    const jql = `project in (${jiraProjects.join(", ")}) AND (${byCode.join(" OR ")})`;
    try {
      for (const r of await jira.search(jql, FIELDS)) {
        const f = r.fields || {};
        if (r.key.toUpperCase() === vacation || isEpicType(f.issuetype)) continue;
        if (f.parent && isEpicType(f.parent.fields?.issuetype)) continue; // belongs to an epic: that epic's project has it
        const code = codeOf(r).toLowerCase();
        const p = c.find((x) => x.code.toLowerCase() === code);
        if (!p || p.issues.some((i) => i.key === r.key)) continue; // text search matched something else
        raws[r.key] ||= r;
        if (!(r.key in via)) via[r.key] = "related";
        addPhase(p, r);
        report.related++;
      }
    } catch (e) { report.errors.push(`Looking up issues with the same project code failed (projects still work with the issues they have): ${e.message}`); }
  }

  /* 6. your hours, carry over your settings, mark new projects */
  const projects = Object.values(built);
  const keys = [...new Set(projects.flatMap((p) => [...p.issues.map((i) => i.key), ...(p.epic ? [p.epic.key] : []), ...(p.merged_epics || []).map((e) => e.key)]))];
  const minutes = await jira.myMinutesPerIssue(acct, keys, settings.track_from || "");
  const oldIssues = Object.fromEntries(old.flatMap((o) => o.issues.map((i) => [i.key, i])));
  const keysOf = (o) => [...o.issues.map((i) => i.key), o.epic?.key, ...(o.merged_epics || []).map((e) => e.key)].filter(Boolean);
  const added = [];
  for (const p of projects) {
    for (const i of p.issues) {
      i.my_minutes = minutes[i.key] || 0;
      if (oldIssues[i.key]?.keywords?.length) i.keywords = oldIssues[i.key].keywords;
      if (oldIssues[i.key]?.work_type) i.work_type = oldIssues[i.key].work_type;
    }
    if (p.epic) p.epic.my_minutes = p.issues.some((i) => i.key === p.epic.key) ? 0 : minutes[p.epic.key] || 0;
    const mine = new Set(keysOf(p));
    p.pinned = [...mine].some((k) => pinned.has(k));
    const prev = old.find((o) => o.id === p.id) ||
      old.find((o) => keysOf(o).some((k) => mine.has(k)) && isConfigured(o)) ||
      old.find((o) => keysOf(o).some((k) => mine.has(k)));
    if (prev) {
      p.keywords = prev.keywords || [];
      p.type_mode = TYPE_MODES.includes(prev.type_mode) ? prev.type_mode : "auto";
      const mode = LEGACY_STATUS[prev.status_mode] || prev.status_mode || "auto";
      p.status_mode = allowedStatuses(p).includes(mode) ? mode : "auto";
      p.added_at = prev.added_at || now;
      p.is_new = false;
    } else {
      p.added_at = now;
      p.is_new = true;
      if (!isInternal(p)) added.push(p.name);
    }
    p.issues.sort((a, b) => keyNum(a.key) - keyNum(b.key));
  }
  report.epics = projects.filter((p) => p.kind === "epic" && !isInternal(p)).length;
  report.merged = projects.reduce((a, p) => a + (p.merged_epics || []).length, 0);
  report.groups = projects.filter((p) => p.kind === "group").length;
  report.internal = projects.filter(isInternal).length;
  report.at = now;
  Object.assign(data, { projects, model: MODEL_VERSION, last_refresh: now, account_id: acct, user: me.displayName || "", last_report: report });
  return added;
}

/* --------------------------------------------------------- find any project in Jira */
/**
 * Search Jira by name (any status, anyone's issues) and group the hits into projects:
 * an epic, the epic of a child issue, or a standalone issue (code group). [{key, name, kind, code, status, in_list}]
 */
export async function findProjects(jira, settings, q, data) {
  const term = clean(q).replace(/["\\*?~^]/g, " ").trim();
  if (term.length < 2) return [];
  const fields = ["summary", "status", "issuetype", "parent"];
  // An issue key ("PRJ-226") is looked up directly, a Jira project key ("PRJ") lists that project's
  // issues; both come first. The name search runs too. A key that doesn't exist is simply not found.
  const raw = [];
  const tryJql = async (jql, n) => { try { raw.push(...await jira.search(jql, fields, n)); } catch { /* not a valid key here */ } };
  const upper = term.toUpperCase();
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(upper)) await tryJql(`issuekey = ${upper}`, 1);
  else if (/^[A-Z][A-Z0-9_]{1,9}$/.test(upper)) await tryJql(`project = ${upper} ORDER BY updated DESC`, 40);
  await tryJql(`summary ~ ${jqlStr(term + "*")} ORDER BY updated DESC`, 60);
  const have = new Set((data.projects || []).flatMap((p) => [...p.issues.map((i) => i.key), p.epic?.key, ...(p.merged_epics || []).map((e) => e.key)]).filter(Boolean));
  const out = new Map();
  const put = (key, name, kind, status) => { if (!out.has(key)) out.set(key, { key, name, kind, status, code: (CODE_RE.exec(name) || [])[1] || "", in_list: have.has(key) }); };
  for (const r of raw) {
    const f = r.fields || {};
    if (isEpicType(f.issuetype)) put(r.key, clean(f.summary), "epic", f.status?.name || "");
    else if (f.parent && isEpicType(f.parent.fields?.issuetype)) put(f.parent.key, clean(f.parent.fields?.summary), "epic", f.parent.fields?.status?.name || "");
    else put(r.key, clean(f.summary).split(SEG_RE)[0], "issue", f.status?.name || "");
  }
  return [...out.values()].slice(0, 25);
}

/* ------------------------------------------------------------------ for the UI */
export function decorate(project) {
  const p = { ...project };
  p.internal = isInternal(project);
  p.auto_internal = autoInternal(project);
  p.type_mode = TYPE_MODES.includes(project.type_mode) ? project.type_mode : "auto";
  p.allowed_statuses = allowedStatuses(project);
  p.auto_status = autoStatus(project);
  p.status = effectiveStatus(project);
  p.status_mode = LEGACY_STATUS[p.status_mode] || p.status_mode || "auto";
  p.total_minutes = project.issues.reduce((a, i) => a + (i.my_minutes || 0), 0) + (project.epic?.my_minutes || 0);
  const vias = [...project.issues.map((i) => i.via || "assigned"), ...(project.epic ? [project.epic.via || "related"] : [])];
  p.via = Object.keys(VIA_RANK).find((v) => vias.includes(v)) || "assigned";
  p.worked_on = vias.includes("worked");
  // the phases calendar events go to right now (one per role)
  const current = p.internal ? new Set() : new Set(ROLES.map((r) => issueFor(project, r)[0]).filter(Boolean));
  p.phases = project.issues.map((i) => ({ ...i, keywords: i.keywords || [], done: isDone(i), current: current.has(i.key) }));
  return p;
}

/* ------------------------------------------------- how an issue is shown everywhere */
// "<project name> – <phase>", e.g. "26.006.P06 - Echo Line 2 – EXEC · SD". The issue key is shown
// separately as small secondary text. Built from data already stored: no extra Jira calls.
export function issueTitle(project, issue) {
  const phase = issue.label && issue.label !== "main" ? issue.label : "";
  if (project.epic && issue.key === project.epic.key && !phase) return project.name;
  return phase ? `${project.name} – ${phase}` : project.name || issue.summary || issue.key;
}

/** For issues that are not in a project (e.g. a worklog on another issue): split the summary at " · ". */
export function titleFromSummary(summary) {
  const s = clean(summary);
  const i = s.indexOf(" · ");
  return i > 0 ? `${s.slice(0, i)} – ${s.slice(i + 3)}` : s;
}

/** key -> title for every issue in the stored projects. */
export function titleMap(projects) {
  const out = {};
  for (const p of projects) {
    if (p.epic && !out[p.epic.key]) out[p.epic.key] = p.name;
    for (const e of p.merged_epics || []) out[e.key] ||= p.name;
    for (const i of p.issues) out[i.key] = issueTitle(p, i);
  }
  return out;
}

export function allIssueOptions(projects, vacationIssue) {
  const opts = [];
  for (const p of projects) {
    const internal = isInternal(p);
    if (!internal && effectiveStatus(p) === "closed") continue;
    for (const i of p.issues) opts.push({ key: i.key, label: issueTitle(p, i), internal });
  }
  if (vacationIssue && !opts.some((o) => o.key === vacationIssue)) opts.push({ key: vacationIssue, label: "Vacation" });
  return opts;
}
