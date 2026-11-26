// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The installer, the update helper and the extension must agree on Timefill's fixed identity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const idOf = (key) => [...createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16).toString("hex")]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16))).join("");

test("the installer's extension id is the one of the key the helper puts into the installed copy", () => {
  const key = /^\$Key\s*=\s*"([^"]+)"/m.exec(read("../installer/timefill-updater.ps1"))[1];
  const id = /^\$ExtensionId\s*=\s*"([a-p]{32})"/m.exec(read("../installer/install.ps1"))[1];
  assert.equal(idOf(key), id);
});

test("the repository's manifest has no key (your development copy keeps its own identity) and may use the helper", () => {
  const m = JSON.parse(read("../extension/manifest.json"));
  assert.equal(m.key, undefined);
  assert.ok(m.permissions.includes("nativeMessaging"));
});

test("the update helper only downloads from the Timefill stable repository, over https", () => {
  const ps = read("../installer/timefill-updater.ps1");
  assert.match(ps, /^\$Repo\s*=\s*"AriaBehnam\/Jira_timefill_Stable"/m);
  const urls = [...ps.matchAll(/"(https?:\/\/[^"$]+)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 2 && urls.every((u) => u.startsWith("https://raw.githubusercontent.com/") || u.startsWith("https://codeload.github.com/")), urls.join(" "));
});

test("the installer never reuses the name of its browser choice for another variable (PowerShell names ignore case)", () => {
  const ps = read("../installer/install.ps1");
  const params = [...ps.matchAll(/\[(?:string|switch)\]\$(\w+)/g)].map((m) => m[1].toLowerCase());
  const loops = [...ps.matchAll(/foreach\s*\(\s*\$(\w+)\s+in/gi)].map((m) => m[1].toLowerCase());
  assert.deepEqual(loops.filter((v) => params.includes(v)), []);
});
