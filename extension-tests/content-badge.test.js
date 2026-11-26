// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The badge in Outlook: red (blinking) while reading, green when done, with the days read ("2–8 Nov").
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeOutlook } from "./fake-outlook.js";

const page = await fakeOutlook();

test("badge: red while reading, then green with the days that were read", async () => {
  page.connect();
  await page.read();
  assert.ok(page.badge.texts.includes("Timefill · reading your calendar…"));
  assert.ok(page.badge.dots.includes("reading"), "red, blinking, while reading");
  assert.match(page.badge.texts.at(-1), /^Timefill · read 2–8 Nov · \d+ events$/);
  assert.deepEqual([...page.badge.dot], ["done"], "green when done");
});
