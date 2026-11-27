// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

/* The language of Timefill's pages: English (as written in the code) or Italiano.
   The pages are written in English; in Italian every text on the page is looked up in the dictionary
   (i18n-it.js) when it appears: plain text, buttons, tooltips, placeholders, messages. Texts that aren't in the
   dictionary (your event titles, project names, Jira keys) stay as they are. Settings → Language. */
import { IT, IT_PATTERNS, IT_HTML } from "./i18n-it.js";

export const LANGUAGES = { en: "English", it: "Italiano" };
const KEY = "timefill_lang"; // the last choice, kept in this browser so the page starts in it at once

let lang = "en";
try { if (globalThis.localStorage?.getItem(KEY) === "it") lang = "it"; } catch { /* private window */ }

export const getLanguage = () => lang;
/** The locale for dates: Italian dates in Italian; English with day before month. */
export function dateLocale() {
  if (lang === "it") return "it-IT";
  const nav = globalThis.navigator?.language || "";
  return /^en\b/i.test(nav) ? nav : "en-GB";
}

/** Sets the language (from Settings). Returns true when it changed. */
export function setLanguage(l) {
  const next = l === "it" ? "it" : "en";
  try { globalThis.localStorage?.setItem(KEY, next); } catch { /* private window */ }
  if (globalThis.document?.documentElement) document.documentElement.lang = next;
  if (next === lang) return false;
  lang = next;
  return true;
}

/* ---------------------------------------------------------------- patterns */
// "{n} calendar events": {n}, {m}, {k} are numbers or hours ("3", "2.5h", "12%"); any other {name} is any text.
// A text placed into the translation is translated too when it is itself in the dictionary ("Open" → "Aperti").
const NUM = "([\\d.,]+(?:h|%)?)";
const compiled = Object.entries(IT_PATTERNS).map(([from, to]) => {
  const names = [];
  const src = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{(\w+)\\\}/g, (_, n) => {
    names.push(n);
    return /^[nmk]$/.test(n) ? NUM : "(.+?)";
  });
  return { re: new RegExp(`^${src}$`, "s"), names, to };
});

const norm = (s) => s.replace(/\s+/g, " ").trim();

/** The Italian for one English text (unchanged when not found or in English). */
export function tr(text) {
  if (lang !== "it" || text == null) return text;
  const s = String(text);
  // nothing to translate: no words ("2.5h", "09:00–10:00", "40%"), or a long text (an error from a server)
  if (!/[A-Za-z]{2}/.test(s) || s.length > 1500) return s;
  const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - trail.length);
  const out = translateCore(core, 0);
  return out === null ? s : lead + out + trail;
}

function translateCore(core, depth) {
  if (depth > 4 || !core) return null;
  const n = norm(core);
  if (Object.prototype.hasOwnProperty.call(IT, n)) return IT[n];
  // the lines of a tooltip one by one
  if (core.trim().includes("\n")) { const lines = joinParts(core.split("\n"), "\n", depth); if (lines !== null) return lines; }
  for (const p of compiled) {
    const m = p.re.exec(n);
    if (!m) continue;
    return p.to.replace(/\{(\w+)\}/g, (all, name) => {
      const i = p.names.indexOf(name);
      if (i < 0) return all;
      const v = m[i + 1];
      return /[A-Za-z]/.test(v) ? translateCore(v, depth + 1) ?? v : v;
    });
  }
  // the parts of "a · b · c"
  if (n.includes(" · ")) { const parts = joinParts(n.split(" · "), " · ", depth); if (parts !== null) return parts; }
  // a separator left at the start or end of a piece of text ("· to fill", "issues found ·", "since 1 Oct —")
  const edge = /^([·—–,]\s+)?(.*?)(\s+[·—–])?$/s.exec(n);
  if (edge && (edge[1] || edge[3]) && edge[2]) {
    const mid = translateCore(edge[2], depth + 1);
    if (mid !== null) return (edge[1] || "") + mid + (edge[3] || "");
  }
  return null;
}
function joinParts(parts, sep, depth) {
  let changed = false;
  const out = parts.map((p) => {
    const lead = p.match(/^\s*/)[0], trail = p.slice(lead.length).match(/\s*$/)[0];
    const core = p.slice(lead.length, p.length - trail.length);
    const t = /[A-Za-z]/.test(core) ? translateCore(core, depth + 1) : null;
    if (t === null) return p;
    changed = true;
    return lead + t + trail;
  });
  return changed ? out.join(sep) : null;
}

/** A help text with markup (bold words, links): the whole Italian paragraph, by its name. */
export const trh = (id, englishHtml) => (lang === "it" && IT_HTML[id]) || englishHtml;

/* ------------------------------------------------------------- the page */
const ATTRS = ["title", "placeholder", "aria-label", "data-tip"];
// never translated: your own data and technical output
const SKIP = "script, style, textarea, pre, code, .bn, .bl, .it, .ik, [data-notr]";

function translateNode(node) {
  if (node.nodeType === 3) {
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const t = tr(node.nodeValue);
    if (t !== node.nodeValue) node.nodeValue = t;
    return;
  }
  if (node.nodeType !== 1 || node.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (v) { const t = tr(v); if (t !== v) node.setAttribute(a, t); }
  }
}
/** Translates everything under `root` (text and the attributes people read). */
function translateTree(root) {
  if (lang !== "it" || !root) return;
  translateNode(root);
  if (root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, 5 /* elements + text */);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) translateNode(n);
}

let observer = null;
/** From now on, everything that appears on the page is translated as it appears. */
export function startTranslating() {
  document.documentElement.lang = lang;
  if (lang !== "it" || observer) return;
  document.title = tr(document.title);
  translateTree(document.body);
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "childList") r.addedNodes.forEach(translateTree);
      else translateNode(r.target);
    }
    observer.takeRecords(); // our own changes
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
