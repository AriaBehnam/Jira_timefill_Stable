// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Italian Outlook: "Deseleziona calendario 'Calendario'" is your calendar, ticked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({ outlookLabels: true, italian: true, calendars: [{ name: "Calendario" }, { name: "Collega", selected: false }] });

test("Italian: your calendar is recognised and everything on the page is read, nothing unticked", async () => {
  assert.deepEqual(page.P.shownCalendars(document, "Calendar, Calendario"), [{ name: "Calendario", own: true }]);
  const r = await page.read();
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(page.toggles, []);
});
