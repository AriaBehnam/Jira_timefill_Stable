// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Runs inside the Outlook web tab, but only while the Timefill page is open: Timefill injects this script and keeps a
// connection to the tab. While connected it reads the calendar the page shows (via outlook-parser.js) on every view
// change and stores it in the extension's own storage. When the Timefill tab closes, the connection drops and this
// script stops watching the page and removes its badge. It never types, saves or edits anything in Outlook.
// The only clicks are on "+N more events" buttons (to show events Outlook hides), once per button per week shown;
// a popup that opens because of that click is closed again with Escape.
(() => {
  // Already installed by a live copy of the extension? Then that copy handles the new connection.
  // (After the extension is reloaded, the old copy is dead: its ping fails and this copy installs itself.)
  try { if (globalThis.__timefillPing?.()) return; } catch { /* old copy is dead */ }
  const extensionAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  globalThis.__timefillPing = extensionAlive;

  const P = globalThis.TimefillParser;
  const DEFAULTS = { numeric_date_order: "dmy", show_outlook_badge: true, expand_more_events: true, own_calendars: "Calendar, Calendario, Kalender, Calendrier" };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const onCalendar = () => /\/calendar/i.test(location.pathname);

  async function settings() {
    const o = await chrome.storage.local.get("settings");
    return { ...DEFAULTS, ...(o.settings || {}) };
  }

  /* --- "+N more events": click once per button per view, keep what was found for that view --- */
  let viewKey = "", clicked = new Set(), tries = new Map(), hidden = new Map(), yielded = new Set(), expanding = false, lastStats = null;

  // Only what you can see counts: Outlook keeps some (hidden) dialogs and menus in the page all the time.
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
  const openPopups = () => [...document.querySelectorAll(P.CONFIG.popupSelector)].filter(visible);

  // Never click while you are working in Outlook: typing somewhere, or a form / peek / popup is open.
  function userBusy() {
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
    return openPopups().length > 0;
  }

  async function expandHidden(opts, stats) {
    if (userBusy()) {
      const a = document.activeElement;
      stats.expandSkipped = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) ? "you were typing in Outlook" : `a popup was open in Outlook (${openPopups().length})`;
      return;
    }
    stats.moreButtons = P.findMoreButtons(document).length;
    expanding = true;
    try {
      // The buttons are looked up again before every click: in the new Outlook ONE click expands the whole
      // all-day row and the other "+N" buttons disappear (old references would be stale).
      for (let round = 0; round < 12; round++) {
        const next = P.findMoreButtons(document).find((b) => !clicked.has(b.label) && b.el.isConnected);
        if (!next) break;
        if (userBusy()) { stats.expandSkipped = "stopped: a popup or form was open"; break; } // you started doing something
        const { el, label, date } = next;
        stats.moreClicked++;
        const before = new Set(document.querySelectorAll(P.CONFIG.popupSelector));
        const labelsBefore = new Set(P.readPage(document, opts).events.map(P.eventKey));
        el.click();
        // Wait (up to 4 s) for one of: a popup with the hidden events, or the row expanded in place
        // (the "+N" buttons are gone, or this one is), then a moment more for Outlook to finish drawing.
        let opened = [], mode = "nothing happened";
        for (let waited = 0; waited < 4000; waited += 150) {
          await sleep(150);
          opened = openPopups().filter((x) => !before.has(x));
          if (opened.length && opened.some((x) => x.querySelector("[aria-label], [title]"))) { mode = "popup"; await sleep(250); break; }
          if (!el.isConnected || !P.findMoreButtons(document).some((b) => b.label === label)) { mode = "row expanded"; await sleep(400); break; }
        }
        stats.mode = mode;
        let found = 0;
        if (mode === "popup") {
          // The popup's events may carry no date (it is in the button): read them as events of that day.
          const popOpts = { ...opts, fallbackDate: date || undefined };
          for (const box of opened) {
            const r = P.readPage(box, popOpts);
            stats.popupLabels += r.labelsSeen;
            for (const ev of r.events) { hidden.set(P.eventKey(ev), ev); found++; }
            for (const x of box.querySelectorAll("[aria-label], [title]")) {
              const l = (x.getAttribute("aria-label") || x.getAttribute("title") || "").replace(/\s+/g, " ").trim();
              if (l && stats.popupSample.length < 25) stats.popupSample.push({ button: label, label: l.slice(0, 200), read: P.whyNot(l, popOpts) || "read as an event" });
            }
          }
          // Close only the popup this click opened: it must be new, be the one the button controls (if it says).
          const controls = el.getAttribute("aria-controls");
          const mine = opened.filter((x) => (controls ? x.id === controls || x.querySelector(`#${CSS.escape(controls)}`)
            : P.readPage(x, popOpts).events.length > 0)); // without aria-controls: only a popup that lists events
          for (const o of mine)
            o.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));
          if (mine.length) await sleep(250);
        } else {
          // Expanded in place: the hidden events are now on the page, read with everything else.
          for (const ev of P.readPage(document, opts).events) if (!labelsBefore.has(P.eventKey(ev))) { hidden.set(P.eventKey(ev), ev); found++; }
        }
        stats.hiddenFound += found;
        // A button is clicked again on the next read if nothing came of it (at most 3 times per week shown).
        const n = (tries.get(label) || 0) + 1;
        tries.set(label, n);
        if (found || mode === "row expanded" || n >= 3) clicked.add(label);
        if (found || mode === "row expanded") yielded.add(label);
      }
    } finally { expanding = false; }
  }

  /*
   * Only your calendar is read. Which calendars are shown is taken from Outlook's calendar list only (ticked =
   * aria-selected), never guessed per event (colours change with categories and for past events).
   *   - only your calendar ticked: every event on the page is yours;
   *   - others ticked too (a colleague's, a team calendar): they are unticked for the read and ticked again right
   *     after, so your view comes back as it was. A read made while another calendar is still shown is never stored.
   */
  let toggling = false, lastHide = null;
  // Wait until Outlook has redrawn: the number of events on the page stops changing (every 150 ms, max 3 s).
  async function settle() {
    const count = () => document.querySelectorAll("[data-calitemid]").length || P.readPage(document, {}).labelsSeen;
    let last = -1, same = 0;
    for (let waited = 0; waited < 3000 && same < 2; waited += 150) {
      await sleep(150);
      const n = count();
      same = n === last ? same + 1 : 0;
      last = n;
    }
  }

  async function capture(manual) {
    if (!onCalendar()) return null;
    const s = await settings();
    const opts = { dateOrder: s.numeric_date_order, url: location.href };
    if (active()) showBadge({ reading: true }, s); // red dot while reading
    try { return await readOnlyYours(manual, s, opts); }
    catch (e) { if (active()) showBadge({ failed: e.message }, s); throw e; }
  }

  async function readOnlyYours(manual, s, opts) {
    const cals = P.calendarOptions(document, s.own_calendars);
    const others = cals.filter((c) => c.selected && !c.own);
    if (!others.length) return readNow(manual, s, opts, []);
    const names = others.map((c) => c.name);
    // Safety: your own calendar must be found ticked in the list, or nothing is unticked (it is never touched).
    if (!cals.some((c) => c.own && c.selected)) {
      if (active()) showBadge({ waiting: names, why: "your calendar was not found in the list" }, s);
      return { ok: false, paused: true, error: `Timefill can't find your own calendar ticked in Outlook's calendar list (it looks for: ${s.own_calendars}). `
        + `Calendars found ticked: ${names.join(", ")}. If one of them is yours, add its name in Settings → Your calendars. Nothing was stored or unticked.` };
    }
    const week = P.readPage(document, opts).visibleDates.join(",");
    // our own unticking makes the page change: the automatic reads that follow don't untick again for 5 minutes
    const recent = lastHide && lastHide.week === week && Date.now() - lastHide.at < 5 * 60 * 1000;
    const notNow = (why) => {
      if (active()) showBadge({ waiting: names, why }, s);
      return { ok: false, paused: true, error: `Outlook also shows ${names.join(", ")}: ${why}. Nothing was stored from it.` };
    };
    if (cals.some((c) => c.own && c.selected && c.duplicate))
      return notNow("two ticked calendars have your calendar's name, so Timefill can't tell which is yours");
    if (!manual) return notNow("Timefill reads only your calendar when you open the Status page or press ↻ Refresh");
    if (userBusy()) return notNow("you are typing or have a form open in Outlook; read again with ↻ Refresh");
    if (others.some((c) => !c.toggle)) return notNow(`Timefill can't untick ${others.filter((c) => !c.toggle).map((c) => c.name).join(", ")} safely`);
    if (recent && !manual) return notNow("read a moment ago with only your calendar");
    const turnedOff = [];
    toggling = true;
    try {
      for (const c of others) { c.el.click(); turnedOff.push(c.name); }
      await settle();
      const after = P.calendarOptions(document, s.own_calendars);
      const still = after.filter((c) => c.selected && !c.own).map((c) => c.name);
      if (still.length) return notNow(`could not untick ${still.join(", ")} for the read`); // never store a mixed read
      if (!after.some((c) => c.own && c.selected)) return notNow("your own calendar was no longer ticked"); // never read an empty view
      lastHide = { week, at: Date.now() };
      return await readNow(manual, s, opts, names);
    } finally {
      // tick again exactly those Timefill unticked
      for (const c of P.calendarOptions(document, s.own_calendars)) if (turnedOff.includes(c.name) && !c.selected && c.toggle) c.el.click();
      if (turnedOff.length) await settle();
      toggling = false;
    }
  }

  /** "16–22 Nov", "30 Nov – 6 Dec", "28 Dec 2026 – 3 Jan 2027" */
  function dayRange(first, last) {
    const d = (iso) => { const [y, m, dd] = iso.split("-").map(Number); return { y, m, dd }; };
    const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const a = d(first), b = d(last);
    if (first === last) return `${a.dd} ${M[a.m - 1]}`;
    if (a.y !== b.y) return `${a.dd} ${M[a.m - 1]} ${a.y} – ${b.dd} ${M[b.m - 1]} ${b.y}`;
    if (a.m !== b.m) return `${a.dd} ${M[a.m - 1]} – ${b.dd} ${M[b.m - 1]}`;
    return `${a.dd}–${b.dd} ${M[b.m - 1]}`;
  }

  async function readNow(manual, s, opts, hid) {
    let res = P.readPage(document, opts);
    // Counts for the trace (Timefill logs them in its console; also logged here, in the Outlook tab's console)
    const stats = { labelsBefore: res.labelsSeen, moreButtons: 0, moreClicked: 0, popupLabels: 0, hiddenFound: 0, expandSkipped: null, popupSample: [] };
    const key = location.pathname + "|" + res.visibleDates.join(",");
    if (key !== viewKey) { viewKey = key; clicked = new Set(); tries = new Map(); hidden = new Map(); yielded = new Set(); }
    // "+N more events" are opened when Timefill asks (Status page, Refresh), and also on the automatic reads while
    // the Outlook tab is in the background or not focused, so popups never open in front of you while you work there.
    const unseen = P.findMoreButtons(document).some((b) => !clicked.has(b.label));
    const inBackground = document.hidden || !document.hasFocus();
    if ((manual || (inBackground && unseen)) && s.expand_more_events !== false && res.visibleDates.length) {
      stats.expandedBy = manual ? "Timefill asked" : "automatic (Outlook tab in the background)";
      await expandHidden(opts, stats);
      res = P.readPage(document, opts);
    }
    stats.labelsAfter = res.labelsSeen;
    stats.calendarsUntickedForTheRead = hid;
    // add the events seen only inside "+N more" popups (same title + start = same event)
    const keys = new Set(res.events.map(P.eventKey));
    const before = res.events.length;
    for (const [k, ev] of hidden) {
      if (!keys.has(k)) { keys.add(k); res.events.push(ev); }
    }
    // days with a "+N more" that wasn't opened (or showed nothing): keep the all-day events stored for them
    stats.keepAllDayFor = [...new Set(P.findMoreButtons(document).filter((b) => b.date && !yielded.has(b.label)).map((b) => b.date))];
    Object.assign(stats, { hiddenAdded: res.events.length - before, parsed: res.events.length,
      parsedAllDay: res.events.filter((e) => e.allDay).length, skippedCancelledDeclined: res.skipped,
      allDay: res.events.filter((e) => e.allDay).map((e) => ({ subject: e.subject, start: e.start, end: e.end, busy: e.busy })) });
    lastStats = { at: new Date().toISOString(), days: res.visibleDates, ...stats };
    if (manual) console.info("[Timefill] Outlook read", res.visibleDates[0] || "?", "→", res.visibleDates[res.visibleDates.length - 1] || "?",
      `(${res.method})`, { ...stats, allDay: undefined }, stats.allDay);
    if (res.visibleDates.length) {
      const o = await chrome.storage.local.get("calendar_cache");
      const cache = o.calendar_cache || {};
      // While Outlook is still loading a week, the page can briefly show no events.
      // Automatic reads never replace stored events with "nothing"; a manual read can.
      const wouldErase = !res.events.length && res.visibleDates.some((d) => cache[d]?.events?.length);
      if (manual || !wouldErase)
        await chrome.storage.local.set({ calendar_cache: P.mergeIntoCache(cache, res.visibleDates, res.events, new Date(), stats.keepAllDayFor) });
    }
    if (active()) showBadge({ ...res, hid }, s);
    return { ok: true, count: res.events.length, visibleDates: res.visibleDates, method: res.method, url: location.href, stats, hid_calendars: hid };
  }

  /* --- small badge while Timefill is open (inside a shadow root so it can't affect Outlook's styles) --- */
  let badgeHost = null;
  function removeBadge() { badgeHost?.remove(); badgeHost = null; }
  // Yellow (blinking) while reading, green when done, red when not read. The yellow stays at least ~1 s, so you see
  // it also when a read is quick.
  let readingSince = 0, badgeTicket = 0;
  function showBadge(res, s) {
    const ticket = ++badgeTicket;
    if (res.reading) readingSince = Date.now();
    else if (readingSince) {
      const wait = 1000 - (Date.now() - readingSince);
      readingSince = 0;
      if (wait > 0) { setTimeout(() => { if (ticket === badgeTicket) drawBadge(res, s); }, wait); return; }
    }
    drawBadge(res, s);
  }
  function drawBadge(res, s) {
    if (!s.show_outlook_badge) { removeBadge(); return; }
    if (!badgeHost) {
      badgeHost = document.createElement("div");
      badgeHost.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;";
      const root = badgeHost.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>
        button{font:12px/1.2 "Segoe UI",sans-serif;background:#23221f;color:#fffdf8;border:0;border-radius:99px;
               padding:6px 12px 6px 10px;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25);opacity:.88}
        button:hover{opacity:1} i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#dc2626;margin-right:6px;transition:background .2s}
        i.done{background:#22c55e} i.reading{background:#facc15;animation:blink 1s ease-in-out infinite} @keyframes blink{50%{opacity:.35}}
      </style><button title="Go to Timefill (reads this calendar while Timefill is open, never edits it)"><i></i><span></span></button>`;
      root.querySelector("button").addEventListener("click", () => {
        try { chrome.runtime.sendMessage({ type: "open-app" }).catch(() => {}); } catch { /* extension reloaded */ }
      });
      badgeHost._label = root.querySelector("span");
      badgeHost._dot = root.querySelector("i");
      document.documentElement.appendChild(badgeHost);
    }
    // red (blinking) while reading, green when done
    const dot = badgeHost._dot;
    if (dot?.classList) { dot.classList.toggle("reading", !!res.reading); dot.classList.toggle("done", !res.reading && !res.failed && !!res.visibleDates?.length); }
    if (res.reading) { badgeHost._label.textContent = "Timefill · reading your calendar…"; return; }
    if (res.waiting) { badgeHost._label.textContent = `Timefill · not read now: ${res.waiting.join(", ")} also shown (${res.why})`; return; }
    if (res.failed) { badgeHost._label.textContent = `Timefill · could not read: ${res.failed}`; return; }
    const days = res.visibleDates || [];
    const range = days.length ? dayRange(days[0], days[days.length - 1]) : "";
    badgeHost._label.textContent = !days.length ? "Timefill · open a week view"
      : `Timefill · read ${range} · ${res.events.length} events${res.hid?.length ? ` · only your calendar (${res.hid.length} other${res.hid.length > 1 ? "s" : ""} unticked for the read)` : ""}`;
  }

  /* --- watching the page: only while at least one Timefill page is connected --- */
  const ports = new Set();
  const active = () => ports.size > 0;
  let observer = null, timer = null;

  function start() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!extensionAlive()) { stop(); return; }
      if (expanding || toggling) return; // our own clicks ("+N more", calendars unticked for the read)
      clearTimeout(timer);
      timer = setTimeout(() => capture(false).catch(() => {}), 1500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
    timer = setTimeout(() => capture(false).catch(() => {}), 800);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    clearTimeout(timer);
    removeBadge();
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "timefill-app") return;
    ports.add(port);
    start();
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError; // Timefill closed or was suspended: expected, not an error
      ports.delete(port);
      if (!active()) stop();
    });
  });

  // Requests from the Timefill page (it is open whenever it asks).
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === "timefill-read") {
      capture(true).then(reply, (e) => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg?.type === "timefill-busy") { // asked before Timefill moves this tab to another week
      reply({ busy: userBusy(), onCalendar: onCalendar() });
      return false;
    }
    if (msg?.type === "timefill-diagnose") {
      // lastRead = what the last read found behind the "+N more events" buttons (clicked, popups, their labels)
      settings().then((s) => reply({ ...P.diagnose(document, { dateOrder: s.numeric_date_order, url: location.href, find: String(msg.find || "").slice(0, 100), ownCalendars: s.own_calendars }), lastRead: lastStats }),
        (e) => reply({ error: e.message }));
      return true;
    }
    return false;
  });
})();
