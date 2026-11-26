// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// The Outlook reader watches the page only while a Timefill page is connected to the tab.
import assert from "node:assert/strict";
import { test } from "node:test";

const observers = [];
globalThis.MutationObserver = class {
  constructor(cb) { this.cb = cb; this.on = false; observers.push(this); }
  observe() { this.on = true; }
  disconnect() { this.on = false; }
};
globalThis.location = { pathname: "/calendar/view/workweek", href: "https://outlook.office.com/calendar/view/workweek" };
globalThis.document = { documentElement: { appendChild() {} }, querySelectorAll: () => [], createElement: () => ({}) };
globalThis.TimefillParser = {
  CONFIG: { popupSelector: ".popup" }, findMoreButtons: () => [], eventKey: (e) => e.subject,
  readPage: () => ({ events: [], visibleDates: [], method: "test" }), mergeIntoCache: (c) => c,
};
const listeners = { connect: [], message: [] };
globalThis.chrome = {
  runtime: { id: "timefill", onConnect: { addListener: (f) => listeners.connect.push(f) }, onMessage: { addListener: (f) => listeners.message.push(f) }, sendMessage() {} },
  storage: { local: { get: async () => ({}), set: async () => {} } },
};

function port(name = "timefill-app") {
  const onDisconnect = [];
  return { name, onDisconnect: { addListener: (f) => onDisconnect.push(f) }, close: () => onDisconnect.forEach((f) => f()) };
}
const watching = () => observers.filter((o) => o.on).length;

test("the reader does nothing until Timefill connects, and stops when Timefill closes", async () => {
  await import("../extension/content.js");
  assert.equal(watching(), 0, "not watching on its own");
  const a = port(), b = port();
  listeners.connect.forEach((f) => f(a));
  assert.equal(watching(), 1, "watching while Timefill is open");
  listeners.connect.forEach((f) => f(b)); // a second Timefill tab
  assert.equal(watching(), 1);
  a.close();
  assert.equal(watching(), 1, "still one Timefill tab open");
  b.close();
  assert.equal(watching(), 0, "stopped after the last Timefill tab closed");
  listeners.connect.forEach((f) => f(port("something-else")));
  assert.equal(watching(), 0, "other connections are ignored");
});

test("injecting the reader again does not install a second copy", async () => {
  const before = listeners.connect.length;
  await import("../extension/content.js?again");
  assert.equal(listeners.connect.length, before);
});
