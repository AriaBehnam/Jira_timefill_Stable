// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The badge in Outlook speaks the language chosen in Settings (here: Italiano).
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook();
page.stored.settings = { language: "it" };

test("badge in Italian: reading, then the days that were read", async () => {
  page.connect();
  await page.read();
  await new Promise((r) => setTimeout(r, 1100));
  assert.ok(page.badge.texts.includes("Timefill · lettura del calendario…"));
  assert.match(page.badge.texts.at(-1), /^Timefill · letto 2–8 nov · \d+ eventi$/);
});
