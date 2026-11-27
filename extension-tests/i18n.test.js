// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// English / Italiano (Settings → Language): the texts of the pages, looked up as they appear.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tr, trh, setLanguage, getLanguage, dateLocale } from "../extension/i18n.js";
import { IT, IT_PATTERNS, IT_HTML } from "../extension/i18n-it.js";

test("English: every text stays as written", () => {
  setLanguage("en");
  assert.equal(getLanguage(), "en");
  assert.equal(tr("Settings"), "Settings");
  assert.equal(trh("help.status", "<b>x</b>"), "<b>x</b>");
});

test("Italiano: whole texts, texts with numbers, and pieces between · separators", () => {
  setLanguage("it");
  assert.equal(dateLocale(), "it-IT");
  assert.equal(tr("Settings"), "Impostazioni");
  assert.equal(tr("\n      ↻ Refresh  "), "\n      ↻ Aggiorna  ", "the spaces around are kept");
  assert.equal(tr("Review & approve · 5 worklogs"), "Rivedi e approva · 5 worklog");
  assert.equal(tr("35 calendar events · 1 Outlook tab open · Jira read 10:32"), "35 eventi del calendario · 1 scheda di Outlook aperta · Jira letto alle 10:32");
  assert.equal(tr("· to fill"), "· da compilare");
  assert.equal(tr("issues you logged time on since 1 ott 2026 —"), "issue su cui hai registrato ore dal 1 ott 2026 —");
  assert.equal(tr("Delta demo 09:00–10:00 — declined, not filled. Click to fill it anyway."), "Delta demo 09:00–10:00 — rifiutato, non compilato. Clicca per compilarlo comunque.");
  assert.equal(tr("Big Job: no open SD phase"), "Big Job: nessuna fase SD aperta");
  assert.equal(tr("Week 47 · 16 nov\nPlaced in Jira: 30h\nMissing: 2h\n(click to select)"), "Settimana 47 · 16 nov\nRegistrate in Jira: 30h\nMancanti: 2h\n(clicca per selezionare)");
  assert.equal(tr("Auto (Open)"), "Auto (Aperti)");
});

test("Italiano: your own texts (event titles, project names, keys) are left alone", () => {
  setLanguage("it");
  for (const s of ["Delta demo", "26.038.P23 - Delta", "PRJ-213", "Echo m weekly", "09:00–10:00", "2.5h"]) assert.equal(tr(s), s);
});

test("Italiano: a translated text is not translated again (the page never changes in a loop)", () => {
  setLanguage("it");
  for (const it of Object.values(IT)) assert.equal(tr(it), it, it);
});

test("dictionary: every help text the pages use has its Italian, and the patterns are well formed", () => {
  const app = readFileSync(new URL("../extension/app.js", import.meta.url), "utf8");
  const used = [...app.matchAll(/trh\("([\w.]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 6);
  for (const id of used) assert.ok(IT_HTML[id], id);
  for (const id of Object.keys(IT_HTML)) assert.ok(used.includes(id), `${id} is not used`);
  for (const [from, to] of Object.entries(IT_PATTERNS)) {
    const names = new Set([...from.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
    assert.ok(names.size, `${from}: no placeholder (put it in IT)`);
    for (const m of to.matchAll(/\{(\w+)\}/g)) assert.ok(names.has(m[1]), `${from}: {${m[1]}} in the translation only`);
  }
  // the ⓘ help of the Status legend
  const help = app.slice(app.indexOf("const HELP = {"), app.indexOf("};", app.indexOf("const HELP = {")));
  const tips = [...help.matchAll(/^\s+\w+: "(.+)",$/gm)].map((m) => m[1]);
  assert.ok(tips.length >= 6);
  for (const t of tips) assert.ok(IT[t], t);
  for (const [from, to] of Object.entries(IT)) {
    assert.equal(from, from.replace(/\s+/g, " ").trim(), `"${from}": write it with single spaces`);
    assert.ok(to, from);
  }
  setLanguage("en");
});
