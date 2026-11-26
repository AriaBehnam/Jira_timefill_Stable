// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Minimal Jira Cloud REST v3 client.
// Auth "browser": uses the Jira login you already have in the browser (cookies). No token needed.
// Auth "token":   e-mail + API token (basic auth), for when the browser login doesn't work.

import { addDaysIso, dateOf, localStamp } from "./planner.js";

export class JiraError extends Error {}

/**
 * The only Jira address credentials may go to: https://<name>.atlassian.net, nothing else.
 * Parsed with URL (a regex let "https://evil.com?.atlassian.net" through). Returns the origin or throws.
 */
export function jiraOrigin(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { u = null; }
  const ok = u && u.protocol === "https:" && /^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(u.hostname)
    && !u.username && !u.password && !u.port && !u.search && !u.hash && (u.pathname === "/" || u.pathname === "");
  if (!ok) throw new JiraError("Jira URL must look like https://yourcompany.atlassian.net (the extension may only talk to atlassian.net).");
  return u.origin;
}

const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-09T08:00:00.000+0100" -> "2026-11-09T08:00" in local time */
export function jiraToLocal(s) {
  return localStamp(new Date(String(s).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")));
}

/** "2026-11-09T08:00" (local) -> "2026-11-09T08:00:00.000+0100" */
export function localToJira(stamp) {
  const [d, t] = stamp.split("T");
  const [h, m] = t.split(":").map(Number);
  const dt = dateOf(d);
  dt.setHours(h, m, 0, 0);
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d}T${pad(h)}:${pad(m)}:00.000${sign}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`;
}

/** Plain text of a worklog comment (Jira sends a document tree, or plain text on older sites). */
export function adfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node.replace(/\s+/g, " ").trim();
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "text" && n.text) out.push(n.text);
    if (Array.isArray(n.content)) { for (const c of n.content) walk(c); if (n.type === "paragraph") out.push(" "); }
  };
  walk(node);
  return out.join("").replace(/\s+/g, " ").trim();
}

export class JiraClient {
  constructor(s, fetchImpl = globalThis.fetch.bind(globalThis)) {
    if (!s.jira_url) throw new JiraError("Set your Jira URL on the Settings page.");
    this.base = jiraOrigin(s.jira_url); // never send credentials anywhere else
    this.fetch = fetchImpl;
    this.headers = { Accept: "application/json", "X-Atlassian-Token": "no-check" };
    this.auth = s.jira_auth === "token" ? "token" : "browser";
    if (this.auth === "token") {
      if (!s.jira_email || !s.jira_token) throw new JiraError("Token login needs your e-mail and API token in Settings.");
      this.headers.Authorization = "Basic " + btoa(unescape(encodeURIComponent(`${s.jira_email}:${s.jira_token}`)));
    }
  }

  async req(method, path, { params, json } = {}) {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
    let r;
    try {
      r = await this.fetch(url.toString(), {
        method,
        headers: json ? { ...this.headers, "Content-Type": "application/json" } : this.headers,
        body: json ? JSON.stringify(json) : undefined,
        credentials: this.auth === "browser" ? "include" : "omit",
        redirect: "error", // never follow a redirect: requests (and the login) go only to your Jira site
      });
    } catch (e) {
      throw new JiraError(`Cannot reach Jira at ${this.base} (${e.message}).`);
    }
    const text = await r.text();
    if (r.status >= 400) {
      let detail = text.slice(0, 300);
      try {
        const b = JSON.parse(text);
        const parts = [...(b.errorMessages || []), ...Object.entries(b.errors || {}).map(([k, v]) => `${k}: ${v}`)];
        if (parts.length) detail = parts.join("; ");
      } catch { /* not json */ }
      if (r.status === 401)
        detail = this.auth === "browser"
          ? "you are not logged in to Jira in this browser - open Jira in a tab, sign in, and try again."
          : "authentication failed - check e-mail and API token.";
      throw new JiraError(`Jira ${method} ${path} -> ${r.status}: ${detail}`);
    }
    if (!text) return null;
    try { return JSON.parse(text); }
    catch { throw new JiraError("Jira answered with a web page instead of data - you are probably not logged in to Jira in this browser."); }
  }

  myself() { return this.req("GET", "/rest/api/3/myself"); }

  /** All fields, to find custom fields like "Project code" by name. */
  fieldsList() { return this.req("GET", "/rest/api/3/field"); }

  async search(jql, fields, max = Infinity) {
    const out = [];
    let token = null;
    for (;;) {
      const body = { jql, fields, maxResults: Math.min(100, max) };
      if (token) body.nextPageToken = token;
      const d = await this.req("POST", "/rest/api/3/search/jql", { json: body });
      out.push(...(d.issues || []));
      token = d.nextPageToken;
      if (!token || d.isLast || out.length >= max) return out.slice(0, max);
    }
  }

  async worklogs(key, startedAfter, startedBefore) {
    const out = [];
    let startAt = 0;
    for (;;) {
      const params = { startAt, maxResults: 1000 };
      if (startedAfter) params.startedAfter = startedAfter.getTime();
      if (startedBefore) params.startedBefore = startedBefore.getTime();
      const d = await this.req("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, { params });
      const batch = d.worklogs || [];
      out.push(...batch);
      startAt += batch.length;
      if (!batch.length || startAt >= (d.total || 0)) return out;
    }
  }

  /** Total minutes YOU logged on each issue (since `since`, a "YYYY-MM-DD" date, or all time), 6 requests at a time. */
  async myMinutesPerIssue(accountId, keys, since = "") {
    const after = since ? new Date(dateOf(since).getTime() - 1) : null; // Jira returns worklogs started *after* this
    const result = {};
    const queue = [...keys];
    const worker = async () => {
      while (queue.length) {
        const key = queue.shift();
        const wl = await this.worklogs(key, after);
        const sec = wl.filter((w) => (w.author || {}).accountId === accountId).reduce((a, w) => a + (w.timeSpentSeconds || 0), 0);
        result[key] = Math.floor(sec / 60);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, keys.length) }, worker));
    return result;
  }

  /** Your worklogs that start between from and to (dates, inclusive). */
  async myWorklogsBetween(accountId, from, to) {
    const startStamp = `${from}T00:00`, endStamp = `${addDaysIso(to, 1)}T00:00`;
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${addDaysIso(from, -1)}" AND worklogDate <= "${addDaysIso(to, 1)}"`;
    const issues = await this.search(jql, ["summary"]);
    const after = dateOf(addDaysIso(from, -1)), before = dateOf(addDaysIso(to, 2));
    const out = [];
    for (const iss of issues) {
      const summary = (iss.fields || {}).summary || "";
      for (const w of await this.worklogs(iss.key, after, before)) {
        if ((w.author || {}).accountId !== accountId) continue;
        const start = jiraToLocal(w.started);
        if (start >= startStamp && start < endStamp)
          out.push({ id: w.id, issue: iss.key, summary, start, seconds: +(w.timeSpentSeconds || 0), comment: adfText(w.comment) });
      }
    }
    return out;
  }

  worklog(key, id) {
    return this.req("GET", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${encodeURIComponent(id)}`);
  }

  deleteWorklog(key, id) {
    return this.req("DELETE", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${encodeURIComponent(id)}`, { params: { notifyUsers: "false" } });
  }

  /** Change the start and length of an existing worklog; its comment is sent back unchanged. */
  updateWorklog(key, id, startedLocal, seconds, comment = null) {
    const body = { started: localToJira(startedLocal), timeSpentSeconds: Math.round(seconds) };
    if (comment) body.comment = comment;
    return this.req("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${encodeURIComponent(id)}`,
      { params: { notifyUsers: "false" }, json: body });
  }

  /** comment: plain text, or a Jira document (ADF) copied from another worklog. */
  addWorklog(key, startedLocal, seconds, comment = "") {
    const body = { started: localToJira(startedLocal), timeSpentSeconds: Math.round(seconds) };
    if (comment && typeof comment === "object") body.comment = comment;
    else if (comment)
      body.comment = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: comment.slice(0, 1000) }] }] };
    return this.req("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, { params: { notifyUsers: "false" }, json: body });
  }
}
