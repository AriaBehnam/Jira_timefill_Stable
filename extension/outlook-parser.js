// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

/*
 * outlook-parser.js — the ONLY file that knows how the Outlook web page looks.
 *
 * It reads calendar events from the accessibility text (aria-label) Outlook puts on each event,
 * e.g.  "Alpha E layout review, 08:00 to 11:30, Monday, November 9, 2026, Busy, Organizer Name"
 *  or   "Ferie, all day event, Wednesday, 11 November 2026, Out of office"
 *
 * It never types or changes anything in Outlook. The only clicks (done by content.js) are on
 * "+N more events" buttons, to show events Outlook hides; any popup that opens is closed again.
 *
 * IF MICROSOFT CHANGES THE PAGE:
 *   1. Open Timefill -> Settings -> "Diagnose Outlook page" (with the Outlook calendar open in a tab).
 *      It shows the raw labels found on the page and how each one was understood.
 *   2. Adjust CONFIG below (selectors / words), or parseLabel() if the label format itself changed.
 *   3. Run the tests:  cd extension-tests && node --test
 *   4. chrome://extensions -> Timefill -> reload icon.
 *
 * Loaded two ways: as a classic content script in Outlook (sets globalThis.TimefillParser)
 * and by the Node tests (import "../extension/outlook-parser.js").
 */
(function (root) {
  "use strict";

  // ======================= adjust here when Outlook changes ========================
  const CONFIG = {
    // Elements whose aria-label (or title) may describe an event. Non-events are filtered out
    // because their label has no date + time (or "all day").
    eventSelector: "[aria-label], [title]",
    // Elements that show which days are on screen (column headers of the week view).
    dayHeaderSelector: '[role="columnheader"], [role="heading"]',
    // Words that mark an all-day event.
    allDayWords: ["all day", "all-day", "tutto il giorno", "giornata intera", "intera giornata", "ganztägig"],
    // How Outlook names "show as" states. Matched against a whole comma-separated part of the label.
    busyWords: {
      free: 0, disponibile: 0, libero: 0,
      tentative: 1, provvisorio: 1, "da confermare": 1,
      busy: 2, occupato: 2,
      "out of office": 3, oof: 3, away: 3, "fuori sede": 3, "fuori ufficio": 3, "assente": 3,
      "working elsewhere": 4, "lavoro altrove": 4, "lavoro in altra sede": 4,
    },
    showAsPrefixes: ["show as", "shown as", "status", "mostra come", "stato"],
    // Labels whose title starts with one of these are skipped (not read at all).
    cancelledPrefixes: ["canceled:", "cancelled:", "annullato:", "annullata:", "annullato -"],
    declinedPrefixes: ["declined:", "rifiutato:", "rifiutata:"],
    // OPTIONAL "By <organizer>" part. No organizer in the label = your own event.
    organizerPrefixes: ["by ", "organizer:", "organizer ", "organiser ", "organizzatore:", "organizzatore ", "organizzato da "],
    // OPTIONAL response status (whole comma-separated part, optionally after "response:").
    responsePrefixes: ["your response", "response", "la tua risposta", "risposta"],
    responseWords: {
      accepted: "accepted", "tentatively accepted": "tentative", declined: "declined",
      "not responded": "none", "no response": "none", "not yet responded": "none",
      accettato: "accepted", accettata: "accepted", "accettato con riserva": "tentative",
      "accettato provvisoriamente": "tentative", rifiutato: "declined", rifiutata: "declined",
      "nessuna risposta": "none", "non risposto": "none",
    },
    // A leading "<something> icon, " part (e.g. "Recurring icon, ") is not part of the title.
    // Up to 3 words before "icon"; Italian "Icona <something>".
    iconPart: /^(?:[\p{L}\p{N}'’-]+\s+){1,3}icon$|^icona(?:\s+[\p{L}\p{N}'’-]+){1,3}$/iu,
    // Parts of the label that are details, not the event title.
    metaPrefixes: ["location", "luogo",
      "posizione", "recurring", "ricorrente", "evento ricorrente", "event from", "evento da", "attendees",
      "partecipanti", "teams meeting", "riunione di teams", "online meeting", "riunione online"],
    // "+N more events" buttons that hide events (e.g. a full all-day row). content.js clicks them
    // to show the hidden events, reads them, and closes any popup that opened. Nothing is edited.
    moreButtonSelector: 'button, [role="button"]',
    // Only buttons inside the calendar itself (not in popups, peeks or side panels).
    moreButtonScope: '[role="main"]',
    moreButtonPatterns: [
      /^\+\s*\d+(?:\s+more)?(?:\s+(?:all[- ]day\s+)?events?)?$/i, // "+2", "+2 more", "+2 more events"
      /^\d+\s+more(?:\s+(?:all[- ]day\s+)?events?)?$/i,         // "2 more events"
      /^(?:show|see)\s+\d+\s+more(?:\s+(?:all[- ]day\s+)?events?)?$/i, // "Show 2 more (events)"
      /^\+?\s*\d+\s+altr[ie](?:\s+eventi)?$/i,                  // "+2 altri", "2 altri eventi"
      /^(?:mostra\s+)?altri\s+\d+(?:\s+eventi)?$/i,             // "Altri 2 eventi"
      /^\+?\s*\d+\s+more\s+events?\s+from\s+\S.{0,80}$/i,          // "2 more events from Monday, November 9"
      /^(?:\+?\s*\d+\s+)?altri\s+(?:\d+\s+)?eventi\s+(?:da|del|di)\s+\S.{0,80}$/i, // "altri 2 eventi da lunedì 9 novembre"
    ],
    // Items of the calendar list in Outlook's left panel (to notice another person's calendar being shown).
    calendarListSelector: 'button[role="option"], [role="listbox"] [role="option"], [role="navigation"] [role="treeitem"], [role="tree"] [role="treeitem"], [role="navigation"] [role="checkbox"], [role="navigation"] [role="menuitemcheckbox"]',
    // Popups that may open after clicking a "+N more" button; closed again with Escape.
    popupSelector: '[role="dialog"], [role="menu"], .ms-Callout, .fui-PopoverSurface',
    weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
      "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica",
      "lunedi", "martedi", "mercoledi", "giovedi", "venerdi"],
    months: {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
      september: 9, october: 10, november: 11, december: 12,
      jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
      gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8,
      settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
      gen: 1, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, dic: 12,
    },
    maxLabelLength: 800,
    // Outlook's overlap groups ("1:00 PM to 3:00 PM, 3 events, 2 busy, ...") describe several events at once.
    // They are not events: skipped.
    groupLabelPatterns: [
      /^\d{1,2}:\d{2} [AP]M to .*?, \d+ events?,/i,
      /^\d{1,2}[:.]\d{2}(?:\s?[AP]\.?M\.?)?\s+(?:to|-|–|alle)\s+.*?,\s*\d+\s+(?:events?|eventi|appuntamenti),/i,
    ],
    // Parsed events whose title is empty or only a number / year (e.g. "2026") are skipped.
    meaninglessTitle: /^[\d\s.,:;\/\-–]*$/,
  };
  // =================================================================================

  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}])";
  const NOT_LETTER_AFTER = "(?![\\p{L}\\p{N}])";
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const MONTH_ALT = Object.keys(CONFIG.months).sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const WEEKDAY_RE = new RegExp(`${NOT_LETTER_BEFORE}(${CONFIG.weekdays.map(escapeRe).join("|")})${NOT_LETTER_AFTER}`, "iu");

  function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const x = new Date(y, m - 1, d + n);
    return isoOf(x.getFullYear(), x.getMonth() + 1, x.getDate());
  }

  function validDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
    const x = new Date(y, m - 1, d);
    return x.getMonth() === m - 1 && x.getDate() === d;
  }

  function guessYear(m, d, now) {
    // label without a year: take the year that puts the date closest to today
    const y = now.getFullYear();
    let best = y, bestDiff = Infinity;
    for (const c of [y - 1, y, y + 1]) {
      const diff = Math.abs(new Date(c, m - 1, d) - now);
      if (diff < bestDiff) { best = c; bestDiff = diff; }
    }
    return best;
  }

  /** All dates in a text, in order: [{iso, index, end}] */
  function findDates(text, opts = {}) {
    const order = opts.dateOrder || "dmy";
    const now = opts.now || new Date();
    const found = [];
    const add = (y, m, d, match) => {
      if (validDate(y, m, d)) found.push({ iso: isoOf(y, m, d), index: match.index, end: match.index + match[0].length });
    };
    const month = (s) => CONFIG.months[s.toLowerCase().replace(/\.$/, "")];
    const patterns = [
      // November 9, 2026  /  Nov 9 2026
      [new RegExp(`${NOT_LETTER_BEFORE}(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, "giu"),
        (m) => [+m[3], month(m[1]), +m[2]]],
      // 9 November 2026  /  9 novembre 2026
      [new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(?:of\\s+)?(${MONTH_ALT})\\.?,?\\s+(\\d{4})(?!\\d)`, "giu"),
        (m) => [+m[3], month(m[2]), +m[1]]],
      // 2026-11-09
      [/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g, (m) => [+m[1], +m[2], +m[3]]],
      // 09/11/2026 or 9.11.2026 (order from settings)
      [/(?<![\d.:/])(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/g,
        (m) => (order === "mdy" ? [+m[3], +m[1], +m[2]] : [+m[3], +m[2], +m[1]])],
    ];
    for (const [re, toYmd] of patterns) for (const m of text.matchAll(re)) add(...toYmd(m), m);
    if (!found.length) {
      // no year in the label: "Monday, November 9" / "lunedì 9 novembre"
      const noYear = [
        [new RegExp(`${NOT_LETTER_BEFORE}(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?!\\d)`, "giu"), (m) => [month(m[1]), +m[2]]],
        [new RegExp(`(?<!\\d)(\\d{1,2})\\.?\\s+(${MONTH_ALT})${NOT_LETTER_AFTER}`, "giu"), (m) => [month(m[2]), +m[1]]],
      ];
      for (const [re, toMd] of noYear) for (const m of text.matchAll(re)) {
        const [mo, d] = toMd(m);
        add(guessYear(mo, d, now), mo, d, m);
      }
    }
    found.sort((a, b) => a.index - b.index);
    return found.filter((f, i) => !found.slice(0, i).some((g) => f.index < g.end && g.index < f.end));
  }

  /** All clock times in a text, in order: [{minutes, index, end}] — skips numbers inside dates */
  function findTimes(text, dates = []) {
    const re = /(?<![\d:./])(\d{1,2})(?:[:.](\d{2}))?(?:\s*([ap])\.?\s?m\.?(?![a-z]))?(?![\d:/]|\.\d)/giu;
    const out = [];
    for (const m of text.matchAll(re)) {
      if (m[2] === undefined && !m[3]) continue; // a bare number is not a time
      if (dates.some((d) => m.index < d.end && d.index < m.index + m[0].length)) continue;
      let h = +m[1];
      const min = m[2] === undefined ? 0 : +m[2];
      const ap = (m[3] || "").toLowerCase();
      if (ap === "p" && h < 12) h += 12;
      if (ap === "a" && h === 12) h = 0;
      if (h > 24 || min > 59) continue;
      out.push({ minutes: h * 60 + min, index: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  function busyFromPart(part) {
    let p = part.trim().toLowerCase().replace(/[.:]$/, "");
    for (const pre of CONFIG.showAsPrefixes) if (p.startsWith(pre)) p = p.slice(pre.length).replace(/^[\s:]+/, "");
    return Object.prototype.hasOwnProperty.call(CONFIG.busyWords, p) ? CONFIG.busyWords[p] : null;
  }

  /** Outlook's "N events, X busy" overlap group label (not an event). */
  const isGroupLabel = (label) => {
    const t = String(label || "").replace(/\s+/g, " ").trim();
    return CONFIG.groupLabelPatterns.some((re) => re.test(t));
  };

  /** "By Organizer Name" -> "Organizer Name", else null */
  function organizerFromPart(part) {
    const t = part.trim();
    const low = t.toLowerCase();
    for (const pre of CONFIG.organizerPrefixes)
      if (low.startsWith(pre) && t.length > pre.length) return t.slice(pre.length).replace(/^[\s:]+/, "").trim() || null;
    return null;
  }

  /** "Accepted" / "Response: declined" -> "accepted" | "tentative" | "declined" | "none", else null */
  function responseFromPart(part) {
    let p = part.trim().toLowerCase().replace(/[.:]$/, "");
    for (const pre of CONFIG.responsePrefixes) if (p.startsWith(pre + ":") || p.startsWith(pre + " ")) { p = p.slice(pre.length).replace(/^[\s:]+/, ""); break; }
    return Object.prototype.hasOwnProperty.call(CONFIG.responseWords, p) ? CONFIG.responseWords[p] : null;
  }

  // Detail parts (organizer, response, location...) only count after the first part, so a title
  // like "By the river" is still a title.
  function isMetaPart(part, opts, index = 1) {
    const p = part.trim().toLowerCase();
    if (!p) return true;
    if (findDates(part, opts).length || findTimes(part).length) return true;
    if (new RegExp(`^${WEEKDAY_RE.source}$`, "iu").test(p)) return true;
    if (CONFIG.allDayWords.some((w) => p.includes(w))) return true;
    if (busyFromPart(part) !== null) return true;
    if (index === 0) return false;
    if (organizerFromPart(part) !== null || responseFromPart(part) !== null) return true;
    return CONFIG.metaPrefixes.some((w) => p.startsWith(w));
  }

  const startsWithAny = (s, list) => { const l = s.trim().toLowerCase(); return list.some((x) => l.startsWith(x)); };

  /**
   * Turn one aria-label into an event, or null if it doesn't describe an event.
   * Event: {subject, start:"YYYY-MM-DDTHH:MM", end, allDay, busy, cancelled, label}
   */
  function parseLabel(label, opts = {}) {
    const text = String(label || "").replace(/\s+/g, " ").trim();
    if (text.length < 8 || text.length > CONFIG.maxLabelLength) return null;
    if (isGroupLabel(text)) return null;
    const lower = text.toLowerCase();
    let dates = findDates(text, opts);
    // Inside a "+N more events from <day>" popup the date may be only in the button: opts.fallbackDate is that day.
    if (!dates.length && opts.fallbackDate) dates = [{ iso: opts.fallbackDate, index: text.length, end: text.length }];
    if (!dates.length) return null;
    const allDay = CONFIG.allDayWords.some((w) => lower.includes(w));
    const times = findTimes(text, dates);
    if (!allDay && times.length < 2) return null;

    let start, end;
    const d1 = dates[0].iso;
    const d2 = dates.length > 1 && dates[1].iso >= d1 ? dates[1].iso : d1;
    if (allDay) {
      start = `${d1}T00:00`;
      end = `${addDays(d2, 1)}T00:00`; // Outlook shows the last day inclusive
    } else {
      const [t1, t2] = times;
      let endDay = d2;
      if (endDay === d1 && t2.minutes <= t1.minutes) endDay = addDays(d1, 1); // past midnight
      const hm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
      start = `${d1}T${hm(t1.minutes)}`;
      end = t2.minutes >= 1440 ? `${addDays(endDay, 1)}T00:00` : `${endDay}T${hm(t2.minutes)}`;
    }

    const parts = text.split(/,\s*|;\s*/);
    // Drop leading "Recurring icon, " style parts (unless the next part is already the time,
    // i.e. the "icon" part is the real title, like "New icon, 08:00 to 09:00, ...").
    while (parts.length > 1 && CONFIG.iconPart.test(parts[0].trim()) && !isMetaPart(parts[1], opts, 0)) parts.shift();

    // Busy status, organizer and response are all optional.
    let busy = 2, organizer = null, response = null;
    for (const p of parts) { const b = busyFromPart(p); if (b !== null) { busy = b; break; } }
    parts.forEach((p, i) => {
      if (i === 0) return;
      if (organizer === null) organizer = organizerFromPart(p);
      if (response === null) response = responseFromPart(p);
    });

    // Title = the parts before the first "detail" part; fallback = first non-detail part.
    const lead = [];
    for (const [i, p] of parts.entries()) { if (isMetaPart(p, opts, i)) break; lead.push(p.trim()); }
    let subject = lead.join(", ");
    if (!subject) subject = (parts.find((p, i) => !isMetaPart(p, opts, i)) || "").trim();
    if (CONFIG.meaninglessTitle.test(subject)) return null; // no real title: not an event we can use
    const cancelled = startsWithAny(text, CONFIG.cancelledPrefixes) || startsWithAny(subject, CONFIG.cancelledPrefixes);
    const declined = startsWithAny(text, CONFIG.declinedPrefixes) || startsWithAny(subject, CONFIG.declinedPrefixes);
    return { subject, start, end, allDay, busy, organizer, response, own: organizer === null, cancelled, declined, label: text };
  }

  function datesFromUrl(url, s = {}) {
    const m = /\/calendar\/(?:\d+\/)?view\/(day|workweek|week)\/(\d{4})\/(\d{1,2})\/(\d{1,2})/i.exec(url || "");
    if (!m) return [];
    const base = isoOf(+m[2], +m[3], +m[4]);
    if (m[1].toLowerCase() === "day") return [base];
    const [y, mo, d] = base.split("-").map(Number);
    const monday = addDays(base, -((new Date(y, mo - 1, d).getDay() + 6) % 7));
    const n = m[1].toLowerCase() === "workweek" ? 5 : 7;
    return Array.from({ length: n }, (_, i) => addDays(monday, i));
  }

  function weekOf(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const monday = addDays(iso, -((new Date(y, m - 1, d).getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }

  /** Same event shown twice (e.g. in the grid and in a "+N more" popup): same title + start + end. */
  const eventKey = (ev) => `${ev.subject.toLowerCase()}|${ev.start}|${ev.end}`;

  /** Read everything useful from the Outlook page. Pure read: no clicks, no changes. */
  function readPage(doc, opts = {}) {
    const events = [];
    const seen = new Set();
    let labelsSeen = 0, skipped = 0;
    for (const el of doc.querySelectorAll(CONFIG.eventSelector)) {
      const label = el.getAttribute("aria-label") || el.getAttribute("title");
      if (!label) continue;
      labelsSeen++;
      const ev = parseLabel(label, opts);
      if (!ev) continue;
      if (ev.cancelled || ev.declined) { skipped++; continue; }
      const key = eventKey(ev);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(ev);
    }
    // Which days are on screen? 1) column headers, 2) the URL, 3) the weeks of the events found.
    let visibleDates = new Set();
    let method = "headers";
    for (const el of doc.querySelectorAll(CONFIG.dayHeaderSelector)) {
      const t = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 80 || findTimes(t).length) continue;
      for (const d of findDates(t, opts)) visibleDates.add(d.iso);
    }
    if (!visibleDates.size) { method = "url"; datesFromUrl(opts.url).forEach((d) => visibleDates.add(d)); }
    // 3) the "+N more events from <day>" buttons, 4) the week most timed events are in. Never the weeks of long
    //    all-day events: one that started weeks ago would mark (and overwrite) a week that is not on screen.
    if (!visibleDates.size) {
      const fromButtons = findMoreButtons(doc).map((b) => b.date).filter(Boolean);
      if (fromButtons.length) { method = "+N more buttons"; weekOf(fromButtons[0]).forEach((d) => visibleDates.add(d)); }
    }
    if (!visibleDates.size) {
      const count = new Map();
      const short = (e) => !e.allDay || e.end.slice(0, 10) <= addDays(e.start.slice(0, 10), 7);
      for (const e of events.filter((x) => !x.allDay).length ? events.filter((x) => !x.allDay) : events.filter(short)) {
        const monday = weekOf(e.start.slice(0, 10))[0];
        count.set(monday, (count.get(monday) || 0) + 1);
      }
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) { method = "event weeks"; weekOf(best[0]).forEach((d) => visibleDates.add(d)); }
    }
    if (!visibleDates.size) method = "none";
    return { events, visibleDates: [...visibleDates].sort(), method, labelsSeen, skipped };
  }

  /** "+N more events" buttons that are not expanded yet: [{el, label}] (pure; content.js clicks them). */
  function findMoreButtons(doc) {
    const out = [];
    const scoped = CONFIG.moreButtonScope && doc.querySelector?.(CONFIG.moreButtonScope);
    for (const el of doc.querySelectorAll(CONFIG.moreButtonSelector)) {
      if (el.getAttribute("aria-expanded") === "true") continue;
      if (scoped && el.closest && !el.closest(CONFIG.moreButtonScope)) continue;
      const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      if (label && label.length < 120 && CONFIG.moreButtonPatterns.some((re) => re.test(label)))
        out.push({ el, label, date: findDates(label)[0]?.iso || null }); // "… from Wednesday, November 04, 2026" -> that day
    }
    return out;
  }

  /** Why a label is not read as an event (null = it is read). For the Diagnose button. */
  function whyNot(label, opts = {}) {
    const text = String(label || "").replace(/\s+/g, " ").trim();
    if (text.length < 8) return "too short to be an event";
    if (text.length > CONFIG.maxLabelLength) return `longer than ${CONFIG.maxLabelLength} characters`;
    if (isGroupLabel(text)) return "an overlap group (\"N events\"), not one event";
    const dates = findDates(text, opts);
    if (!dates.length && !opts.fallbackDate) return "no date found in the label";
    const allDay = CONFIG.allDayWords.some((w) => text.toLowerCase().includes(w));
    if (!allDay && findTimes(text, dates).length < 2) return "no \"all day\" word and no start + end time";
    if (!dates.length && opts.fallbackDate) return parseLabel(text, opts) ? null : "no title before the date / time parts";
    const ev = parseLabel(text, opts);
    if (!ev) return "no title before the date / time parts";
    if (ev.cancelled) return "cancelled";
    if (ev.declined) return "declined";
    return null;
  }

  /** What the Diagnose button shows. opts.find = a text to look for (e.g. an event title): every element with it is listed. */
  function diagnose(doc, opts = {}) {
    const res = readPage(doc, opts);
    const samples = [], rejected = [], headers = [];
    let groups = 0;
    for (const el of doc.querySelectorAll(CONFIG.eventSelector)) {
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!label) continue;
      const ev = parseLabel(label, opts);
      if (ev && samples.length < 15) samples.push({ label, understood: { subject: ev.subject, start: ev.start, end: ev.end, allDay: ev.allDay,
        busy: ev.busy, organizer: ev.organizer, own: ev.own, response: ev.response, cancelled: ev.cancelled, declined: ev.declined } });
      else if (!ev && isGroupLabel(label)) groups++;
      else if (!ev && rejected.length < 15 && findTimes(label).length && label.length < 300) rejected.push(label);
    }
    for (const el of doc.querySelectorAll(CONFIG.dayHeaderSelector)) {
      const t = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
      if (t && headers.length < 15) headers.push(t.slice(0, 100));
    }
    // all-day events read, and labels that look like all-day events but were not read
    const allDayRead = res.events.filter((e) => e.allDay).map((e) => ({ subject: e.subject, start: e.start, end: e.end, busy: e.busy }));
    const allDayNotRead = [];
    for (const el of doc.querySelectorAll(CONFIG.eventSelector)) {
      const label = (el.getAttribute("aria-label") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!label || label.length > 400 || !CONFIG.allDayWords.some((w) => label.toLowerCase().includes(w))) continue;
      const why = whyNot(label, opts);
      if (why && allDayNotRead.length < 25) allDayNotRead.push({ label, why });
    }
    // everything on the page with the text you look for: its tag, role, label, title and own text
    let found;
    const q = String(opts.find || "").trim().toLowerCase();
    if (q) {
      found = [];
      for (const el of doc.querySelectorAll("*")) {
        const aria = el.getAttribute("aria-label") || "", title = el.getAttribute("title") || "";
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const own = aria.toLowerCase().includes(q) || title.toLowerCase().includes(q);
        // text matches only on small elements (not the whole page / calendar that contains it)
        if (!own && !(text.toLowerCase().includes(q) && text.length < 200 && el.children.length <= 3)) continue;
        found.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || "", ariaLabel: aria, title, text: text.slice(0, 200),
          read: own ? (whyNot(aria || title, opts) || "read as an event") : "(no label: Timefill reads aria-label / title only)" });
        if (found.length >= 30) break;
      }
    }
    return { url: opts.url, find: q || undefined, calendarsShown: shownCalendars(doc, opts.ownCalendars), found, allDayRead, allDayNotRead,
      labelsSeen: res.labelsSeen, eventsFound: res.events.length, skippedCancelledOrDeclined: res.skipped, groupLabelsSkipped: groups,
      moreButtons: findMoreButtons(doc).map((b) => b.label),
      visibleDates: res.visibleDates, visibleDatesFrom: res.method, events: samples,
      labelsWithTimeNotUnderstood: rejected, dayHeaders: headers };
  }

  /**
   * Store what was read: for every visible day, replace that day's cached events.
   * keepAllDayFor = days whose "+N more events" were not opened in this read: their hidden all-day events are not
   * on the page, so the all-day events stored before for those days are kept (not wiped).
   */
  function mergeIntoCache(cache, visibleDates, events, now = new Date(), keepAllDayFor = []) {
    const out = { ...(cache || {}) };
    const readAt = `${isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    for (const d of visibleDates) {
      const dayStart = `${d}T00:00`, dayEnd = `${addDays(d, 1)}T00:00`;
      const fresh = events.filter((e) => e.start < dayEnd && e.end > dayStart)
        .map(({ subject, start, end, allDay, busy, organizer = null, response = null }) => ({ subject, start, end, allDay, busy, organizer, response }));
      if (keepAllDayFor.includes(d)) {
        const k = (e) => `${String(e.subject).toLowerCase()}|${e.start}|${e.end}`;
        const have = new Set(fresh.map(k));
        for (const e of cache?.[d]?.events || []) if (e.allDay && !have.has(k(e))) { fresh.push(e); have.add(k(e)); }
      }
      out[d] = { read_at: readAt, events: fresh };
    }
    const cutoff = addDays(readAt.slice(0, 10), -150);
    for (const d of Object.keys(out)) if (d < cutoff) delete out[d];
    return out;
  }

  /**
   * The calendars in Outlook's calendar list (left panel): [{name, own, selected, el}]. Shown = selected.
   * own = one of your calendar names (Settings → Your calendars, e.g. "Calendar"); every other calendar
   * (people's calendars, other groups) is someone else's. Events carry no owner, so this list is the only way.
   */
  function calendarOptions(doc, ownNames = "") {
    const own = String(ownNames || "").split(/[,;\n]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const notACalendar = /(?:de)?select all|(?:de)?seleziona tutt|show all|mostra tutt|add calendar|aggiungi calendario/i;
    // Outlook labels a calendar's tick box with what a click does: "Deselect calendar 'Calendar'" (it is ticked),
    // "Select calendar 'Colleague'" (it is not); Italian "Deseleziona calendario 'Calendario'". The name is in quotes.
    const ACTION = /^(de)?(?:select|seleziona(?:re)?)\b[^'"‘’“”]*?\b(?:calendar|calendario)\s*['"‘’“”](.+?)['"‘’“”]\s*$/i;
    const out = [], seen = new Map();
    for (const el of doc.querySelectorAll(CONFIG.calendarListSelector)) {
      if (el.closest?.('[role="main"]')) continue; // the calendar grid itself
      // an option of an open drop-down, popup or form (e.g. a people picker) is not the calendar list
      if (el.closest?.('[role="dialog"], [role="menu"], .ms-Callout, .fui-PopoverSurface, .fui-Listbox, [role="combobox"]')) continue;
      const raw = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").replace(/\s+/g, " ").trim();
      const action = ACTION.exec(raw);
      const name = (action ? action[2] : raw.split(/,\s*/)[0]).replace(/\s*\((?:default|predefinito|standard)\)$/i, "").trim();
      if (!name || name.length > 80 || notACalendar.test(name)) continue;
      if (/^\d{1,2}$/.test(name) || findDates(name).length || WEEKDAY_RE.test(name) || findTimes(name).length) continue; // a day, not a calendar
      const as = el.getAttribute("aria-selected"), ac = el.getAttribute("aria-checked");
      const selected = as === "true" || ac === "true" || !!el.querySelector?.('[aria-checked="true"], input[type="checkbox"]:checked')
        || (as === null && ac === null && !!action?.[1]); // only the label says it: "Deselect …" = ticked
      const before = seen.get(name.toLowerCase());
      if (before) { if (selected && before.selected) before.duplicate = true; continue; } // two ticked calendars, same name
      // toggle = a calendar tick box Timefill may click ("Select/Deselect calendar '…'"); anything else is never clicked
      const entry = { name, own: own.includes(name.toLowerCase()), selected, el, toggle: !!action };
      seen.set(name.toLowerCase(), entry);
      out.push(entry);
    }
    return out;
  }
  /** The calendars shown (selected), without the page elements: [{name, own}]. */
  const shownCalendars = (doc, ownNames = "") => calendarOptions(doc, ownNames).filter((c) => c.selected).map(({ name, own }) => ({ name, own }));

  root.TimefillParser = { CONFIG, parseLabel, whyNot, shownCalendars, calendarOptions, isGroupLabel, findDates, findTimes, readPage, findMoreButtons, eventKey, diagnose, mergeIntoCache, datesFromUrl, addDays };
})(globalThis);
