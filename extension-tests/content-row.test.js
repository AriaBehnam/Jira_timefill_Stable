// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The new Outlook: ONE click on any "+N" expands the whole all-day row, the other buttons disappear, and a
// multi-day event is ONE element. Every day it covers gets it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook({ mode: "row" });
const day = (d) => (page.stored.calendar_cache?.[d]?.events || []).filter((e) => e.allDay).map((e) => `${e.subject}${e.busy === 0 ? " (free)" : ""}`).sort();

test("one click expands the row; Thu 5 has Delta demo + Delta + Alpha training (free)", async () => {
  const r = await page.read();
  assert.equal(r.ok, true);
  assert.equal(page.clicks, 1, "one click, the other buttons were gone");
  assert.equal(r.stats.mode, "row expanded");
  assert.deepEqual(day("2026-11-05"), ["Alpha training (free)", "Delta", "Delta demo", "Showroom out (free)"]);
  assert.deepEqual(day("2026-11-04"), ["Alpha training (free)", "Delta demo", "Long reminder (free)", "Showroom out (free)"]);
  assert.deepEqual(day("2026-11-06"), ["Alpha training (free)", "Delta", "Delta demo", "Showroom out (free)"]);
  assert.deepEqual(day("2026-11-03"), ["Alpha training (free)", "Showroom out (free)"]);
});
