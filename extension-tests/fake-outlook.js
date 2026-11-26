// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// A fake Outlook week (2–6 Nov 2026) for the reader tests: some events on the page, and all-day events hidden
// behind "N more events from <day>" buttons whose popups list them without a date (like the new Outlook).
// Loads the real parser and the real reader (content.js). One page per test file (the reader keeps state).
// mode "popup": each button opens a popup listing that day's hidden events (without a date);
// mode "row":   ONE click expands the whole all-day row in place (after a delay) and every "+N" button disappears.
// calendars:    the calendar list, e.g. [{ name: "Calendar", color }, { name: "Colleague", color, events: ["<label>", ...] }]:
//               options like Outlook's (button[role="option"], aria-selected), each with its colour; the events of a
//               shown calendar are on the page in that colour (the page's own events are in the first calendar's).
//               Pointing at an event shows Outlook's card: "<calendar name>\n<title>\n<time>".
// ownEvents:    more events of your own calendar, each with its colour (e.g. a category colour): [{ label, color }]
export async function fakeOutlook({ focused = true, mode = "popup", calendars = [{ name: "Calendar" }], ownEvents = [], outlookLabels = false, italian = false } = {}) {
  await import("../extension/outlook-parser.js");
  const P = globalThis.TimefillParser;
  const page = { popups: [], clicks: 0, cards: 0, P };
  const el = (attrs, extra = {}) => ({
    attrs, id: attrs.id || "", tagName: "DIV", isConnected: true, children: [],
    textContent: attrs.text || attrs["aria-label"] || "",
    getAttribute: (k) => attrs[k] ?? null,
    getClientRects: () => [1],
    closest: () => null,
    // pointing at an event shows its card (calendar name, then title), a moment later
    dispatchEvent(ev) {
      if (ev.type === "mouseover" && attrs.cal) {
        page.cards++;
        const title = String(attrs["aria-label"]).split(", ")[0];
        setTimeout(() => {
          const card = el({}, { innerText: `${attrs.cal}\n${title}\nMon 02-Nov-26 10:00 AM - 11:00 AM`,
            dispatchEvent: (e) => { if (e.key === "Escape") page.popups.splice(page.popups.indexOf(card), 1); return true; } });
          page.popups.push(card);
        }, 200);
      }
      return true;
    },
    ...extra,
  });
  page.el = el;
  const mine = calendars[0];
  const ev = (label, cal = mine) => el({ "aria-label": label, cal: cal.name,
    style: { borderLeftColor: cal.color || "rgb(0, 120, 212)", backgroundColor: "rgba(0, 120, 212, 0.2)" } });
  const grid = [
    ev("Showroom out, all day event, Monday, November 02, 2026 to Monday, November 23, 2026, By Organizer Name, Free"),
    ev("(No subject), all day event, Monday, November 02, 2026, OOF"),
    ev("Delta SdF, 10:30 AM to 12:30 PM, Tuesday, November 03, 2026, Busy"),
    ...ownEvents.map((o) => ev(o.label, { ...mine, color: o.color })),
  ];
  const popupFor = (items) => {
    const children = items.map((l) => ev(l));
    const p = el({}, {
      children,
      querySelector: (s) => (s.startsWith("#") ? null : children[0] || null),
      querySelectorAll: () => children,
      dispatchEvent: (e) => { if (e.key === "Escape") page.popups.splice(page.popups.indexOf(p), 1); return true; },
    });
    return p;
  };
  const expandedRow = [
    "Delta demo, all day event, Wednesday, November 04, 2026 to Friday, November 06, 2026, Busy",
    "Delta, all day event, Thursday, November 05, 2026 to Friday, November 06, 2026, Busy",
    "Repair icon, Alpha training, all day event, Tuesday, November 03, 2026 to Friday, November 06, 2026, Free",
    "Long reminder, all day event, Wednesday, November 04, 2026, Free",
  ];
  const button = (label, items) => el({ "aria-label": label }, { click: () => {
    page.clicks++;
    if (mode === "row") setTimeout(() => { buttons.length = 0; grid.push(...expandedRow.map((l) => ev(l))); }, 800);
    else setTimeout(() => page.popups.push(popupFor(items)), 300);
  } });
  const buttons = [
    button("3 more events from Wednesday, November 04, 2026", ["Delta demo, all day event, Busy", "Alpha training, all day event, Free"]),
    button("3 more events from Thursday, November 05, 2026", ["Delta demo, all day event, Busy", "Delta, all day event, Busy"]),
  ];
  page.focused = focused;
  page.badge = { texts: [], dot: new Set(), dots: [] };
  page.toggles = [];
  // outlookLabels: like the new Outlook, the tick box is labelled with what a click does and has no aria-selected:
  //   "Deselect calendar 'Calendar'" (ticked) / "Select calendar 'Colleague'" (not ticked); Italian with italian: true
  const words = italian ? ["Deseleziona calendario", "Seleziona calendario"] : ["Deselect calendar", "Select calendar"];
  page.calendarEls = calendars.map((c) => {
    let on = c.selected !== false;
    const attrs = { role: "option", style: { backgroundColor: c.color || "rgb(0, 120, 212)" } };
    const sync = () => {
      if (outlookLabels) attrs["aria-label"] = c.fixedLabel || `${on ? words[0] : words[1]} '${c.name}'`;
      else { attrs["aria-label"] = c.name; attrs["aria-selected"] = on ? "true" : "false"; }
    };
    sync();
    const x = el(attrs, { click: () => { on = !on; sync(); page.toggles.push(`${c.name}:${on}`); } });
    x.isOn = () => on;
    x.eventEls = (c.events || []).map((l) => ev(l, c));
    return x;
  });
  const shownEvents = () => page.calendarEls.filter((c) => c.isOn()).flatMap((c) => c.eventEls);
  globalThis.document = {
    activeElement: { tagName: "BODY" },
    get hidden() { return !page.focused; },
    hasFocus: () => page.focused,
    documentElement: { appendChild() {} },
    // the badge Timefill shows in Outlook while it is open (a shadow root with a button and a label)
    // what it shows is recorded in page.badge: { texts: [...], dot: Set of classes }
    createElement: () => ({ style: {}, remove() {}, attachShadow: () => ({ innerHTML: "", querySelector: (sel) => {
      if (sel === "span") return { set textContent(v) { page.badge.texts.push(v); }, get textContent() { return page.badge.texts.at(-1) || ""; } };
      if (sel === "i") return { classList: { toggle: (c, on) => { if (on) page.badge.dot.add(c); else page.badge.dot.delete(c); page.badge.dots.push([...page.badge.dot].join(" ") || "red"); } } };
      return { addEventListener() {} };
    } }) }),
    querySelector: () => null, // no [role="main"]: every button counts
    querySelectorAll: (sel) => {
      if (sel === P.CONFIG.popupSelector || sel === P.CONFIG.hoverCardSelector) return [...page.popups];
      if (sel === P.CONFIG.moreButtonSelector) return buttons;
      if (sel === P.CONFIG.dayHeaderSelector) return []; // the new Outlook has no day headers
      if (sel === P.CONFIG.calendarListSelector) return page.calendarEls;
      if (sel === "[data-calitemid]") return [...grid, ...shownEvents()];
      return [...grid, ...shownEvents(), ...buttons, ...page.popups.flatMap((p) => p.children)];
    },
  };
  globalThis.getComputedStyle = (n) => ({ visibility: "visible", ...(n?.attrs?.style || {}) });
  globalThis.KeyboardEvent = class { constructor(type, o) { Object.assign(this, { type, ...o }); } };
  globalThis.MouseEvent = class { constructor(type, o) { Object.assign(this, { type, ...o }); } };
  globalThis.CSS = { escape: (s) => s };
  globalThis.location = { pathname: "/calendar/view/workweek", href: "https://outlook.cloud.microsoft/calendar/view/workweek" };
  page.observers = [];
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; page.observers.push(this); } observe() {} disconnect() {} };
  page.stored = {};
  const listeners = { message: [], connect: [] };
  globalThis.chrome = {
    runtime: { id: "timefill", onConnect: { addListener: (f) => listeners.connect.push(f) }, onMessage: { addListener: (f) => listeners.message.push(f) }, sendMessage() {} },
    storage: { local: { get: async (k) => ({ [k]: page.stored[k] }), set: async (o) => Object.assign(page.stored, o) } },
  };
  await import("../extension/content.js");
  page.read = () => new Promise((resolve) => listeners.message[0]({ type: "timefill-read" }, null, resolve));
  // Timefill connects: the reader starts watching and reads by itself (no Timefill request = an automatic read)
  page.connect = () => listeners.connect.forEach((f) => f({ name: "timefill-app", onDisconnect: { addListener() {} } }));
  return page;
}
