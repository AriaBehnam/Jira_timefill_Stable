# Changelog

All notable changes to the Timefill Chrome extension (`extension/`). Timefill is designed by Aria Behnam.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions match `extension/manifest.json`.

## [3.0.0] - 2026-11-27

Timefill 3: everything since 2.6.0 in one release (Italian, missing hours that follow your events, ⓘ help on the
Status page, the "Projects you spent the most time on" chart), checked again for safety and stability.

### Changed
- **Your own texts are never translated** in Italian: project names, event titles, Jira summaries and comments stay as
  you wrote them, also where one looks like an ordinary word (e.g. a project called "Training").
- The Status header says **missing** instead of "missing so far": it counts every gap that has started.
- Under the bars of *Projects you spent the most time on*, a project's name is shown without its leading code
  ("26.020.P01 - Alpha" → "Alpha"), so the name fits; the whole name is in the tooltip.
- Charts with very many hours (e.g. *All time*) keep a readable number of lines on the hours axis.

### Fixed
- Switching back to English could, in a browser that can't save the choice, reload the page again and again. It now
  reloads once.

## [2.9.2] - 2026-11-27

### Changed
- **"Projects you spent the most time on" shows up to 20 projects** (was 15); the others are counted below the chart
  and listed in *Show as table*. With fewer projects the columns get wider, so they fill the chart.

## [2.9.1] - 2026-11-27

### Changed
- **"Projects you spent the most time on" has vertical bars**, like *Time by type of work*: one bar per project (most
  hours first, its hours on top, its name below), stacked by phase, with the hours of each phase above the legend.

## [2.9.0] - 2026-11-27

### Added
- **Charts: "Projects you spent the most time on"**, a full-width chart below the others. Your projects are ranked
  from most to fewest hours, and each bar is split by phase, one colour per phase (a phase keeps its colour in every
  period; internal projects and issues outside your projects have their own). Vacation and absence are not counted.
  **Selected period** follows the small calendar; **All time** counts everything since *Track from*. Hover a bar for
  the hours of each phase; *Show as table* lists them all. In English and Italian.

## [2.8.0] - 2026-11-27

### Changed
- **Missing hours follow your events, not the clock.** A gap runs from one event to the next: if it has already
  started, the whole gap is missing (e.g. 08:00–10:30 with your next event at 10:30, also at 08:33). It used to be
  cut at the current time into a "missing" part and a faded part. Gaps that start later today are still faded.
- **The help below the Status calendar moved into ⓘ icons** next to the colours of the legend (already logged,
  to fill, missing, not matched, Jira ≠ calendar, not filled / declined). Hover one to see what you can do with
  those blocks. In English and in Italian.

## [2.7.0] - 2026-11-27

### Added
- **Italian.** Settings → **Language · Lingua** chooses English or Italiano. All of Timefill follows it: the pages,
  buttons, help texts, tooltips, messages, dates (e.g. "lun 23 nov", mini calendar "L M M G V S D") and the badge in
  Outlook ("Timefill · letto 23–27 nov · 35 eventi"). Your own texts (event titles, project names, Jira keys) are
  never translated. The choice is saved with your settings and applied as soon as you press Save.
- The Italian texts live in one file, `extension/i18n-it.js` (English → Italian), so a wording can be changed in one
  place.

### Changed
- In English, dates are now written in English too (they used to follow the computer's language).

## [2.6.0] - 2026-11-27

### Fixed
- **The installer stopped at step 3** ("Impossibile convalidare la variabile … Browser" / "Cannot validate argument
  on parameter 'Browser'"), so the update helper was not set up and **Update** said the installer was needed. A loop
  variable had the same name as the browser choice (PowerShell names ignore upper and lower case). The installer now
  runs through all four steps; run `Install Timefill.cmd` again to set up one-click updates (your settings are kept).

## [2.5.1] - 2026-11-27

### Added
- **Fill a declined or cancelled meeting anyway.** Click its grey block: the usual box opens (project, phase, time),
  and it becomes a normal "to fill" block that you approve as usual; the grey block goes away. Timefill remembers you
  chose to fill it, also after posting.

## [2.5.0] - 2026-11-27

### Changed
- **Declined and cancelled events are shown in grey** on the Status calendar, like the events you chose not to fill
  (crossed out, labelled *declined* or *cancelled*). They were left out entirely; they still never take time and are
  never proposed. The legend says "not filled / declined".

### Fixed
- **Events you declined were proposed (blue)** when the title had no "Declined:" prefix and only your response in the
  label said so ("…, Declined"). Your response now counts too. Also recognised: Italian "Cancellato:" /
  "Cancellata:".

## [2.4.5] - 2026-11-27

### Changed
- **The badge in Outlook is yellow while Timefill reads** (blinking), green when it is done, and red only when the
  calendar was not read. The yellow stays at least about a second, so you also see it when a read is quick. (It was
  a blinking red, hard to tell from "not read".)

## [2.4.4] - 2026-11-27

### Changed
- **Days after today are not shown as missing.** Their time hasn't come yet, so the calendar is simply blank there
  (you can still drag to plan something) and their day total shows nothing missing. Today still shows its missing
  time: the part already past in red, the rest of today faded.

## [2.4.3] - 2026-11-27

### Changed
- The grey of the hours outside your working time is lighter (about half as strong), in light and dark mode.

## [2.4.2] - 2026-11-27

### Changed
- **Hours outside your working time are shaded** in a soft grey on the Status calendar (before your day starts and
  after it ends, following each day's working hours, e.g. a shorter Friday), in light and dark mode. It is only a
  background: blocks stay on top, and you can still drag and create entries there.

## [2.4.1] - 2026-11-27

### Changed
- **Events you chose not to fill are grey.** They were transparent with a dashed outline and easy to miss; now they
  are a solid grey block (crossed out, with ↺ to fill them again), in light and dark mode, and the legend shows
  "not filled".

## [2.4.0] - 2026-11-27

### Added
- **Create an entry with the mouse anywhere.** Drag in any empty part of a day (also over the lunch band) to create
  an entry at that time, not only over red "missing" blocks. Hold **Shift** while dragging to create one on top of
  other blocks; without Shift, dragging a block still moves it.

### Changed
- **Faster loading.**
  - Jira worklogs are read for several issues at a time instead of one after the other.
  - Status page: the week you open is read and shown first; then the week before and after are loaded from Jira in
    the background (Outlook is not touched for them), so going to them with ‹ › is instant.
  - Charts: this week is shown first, in a moment; the whole history follows and the charts are drawn again
    ("loading older weeks…" meanwhile).
- **Jira API token recommended.** The README explains step by step how to create one and why it is the better
  choice (it keeps working when the browser's Jira login expires); Settings says so too.

### Fixed
- **An event you assigned to a project by hand still showed as "not matched"** next to its worklog after posting
  (worklogs posted before 2.0 remembered no event for it). It is now matched by its title and time.

## [2.3.0] - 2026-11-26

### Added
- **Microsoft Edge.** Timefill is the same extension for Google Chrome and Microsoft Edge (checked: it loads and runs
  in Edge, also the installed copy with its fixed identity, so one-click updates work there too). The installer
  asks which browser you use when both are installed (Chrome, Edge or both), opens the right extensions page and
  shows the steps for that browser.

### Changed
- Texts in Timefill and the README say "this browser" instead of "this Chrome" (e.g. "Use my Jira login in this
  browser").

## [2.2.0] - 2026-11-26

### Added
- **Dark mode.** A **☾ / ☀** button in the top-right corner switches between light and dark. Until you choose, Timefill
  follows your system's setting; your choice is remembered in this browser. The colours keep their meaning (green in
  Jira, blue to fill, red missing, yellow not matched, orange different); only the surroundings turn dark. The theme
  is set before the page is drawn, so it never flashes white.

## [2.1.0] - 2026-11-26

### Added
- **Windows installer.** Double-click `Install Timefill.cmd` (no administrator rights): it copies Timefill to
  `%LOCALAPPDATA%\Timefill`, gives that copy Timefill's fixed identity, sets up the update helper for Chrome and
  Edge, opens the extensions page and copies the folder for "Load unpacked" (the one step a browser only lets you do
  yourself). `Uninstall Timefill.cmd` removes it again.
- **Update with one click.** Settings → **Updates** shows your version, **Check for updates** and **Update now**; a
  line at the top of Timefill says when a new version is out (checked at most once a day). The update helper
  downloads the latest **stable** release from GitHub (`Jira_timefill_Stable`) only, checks it is Timefill,
  replaces the files and Timefill restarts and opens again. Your settings are kept. Needs the installer; a copy
  loaded by hand is updated by hand as before. New permission: `nativeMessaging` (to talk to the update helper).

### Changed
- **README:** installing with the installer, updating with one click, uninstalling; the developer section is
  removed.

## [2.0.2] - 2026-11-26

### Fixed
- **The box of an event stays next to its event when you scroll.** It used to stay in the same place on the
  screen while the calendar moved under it; now it moves with its block, also when only the calendar scrolls.

## [2.0.1] - 2026-11-26

### Added
- **License: Apache License 2.0** (`LICENSE`), with a `NOTICE` file ("Designed by Aria Behnam") that copies and
  changed versions must keep. Every source file carries the license tag next to its copyright line.

### Changed
- **README rewritten for new users:** what you need, step-by-step install (download, unzip, load in Chrome),
  first-time setup, everyday use, how to update and uninstall, troubleshooting, privacy & safety, and the license.

## [2.0.0] - 2026-11-25

Version 2: a clean start of the repository (only the Chrome extension, its tests and documentation), after a
security review of the whole extension.

### Security
- **The Jira API token is stored apart from the settings.** The reader in the Outlook tab loads the settings and
  never the token; a token saved by an older version is moved automatically. (With "Use my Jira login in this
  Chrome", the default, no token is stored at all.)
- **Jira requests never follow a redirect**, so requests and your Jira login go only to your Jira site.
- **Only an Outlook tab that shows the calendar is moved to another week**, never a mail tab or one where you are
  typing or have a form open.
- **Other people's calendars are unticked only when you ask** (Status page, ↻ Refresh), and only real calendar tick
  boxes ("Select/Deselect calendar '…'") are clicked, never an option of a drop-down, popup or form. Automatic reads
  with another calendar shown store nothing. If two ticked calendars have your calendar's name, nothing is read.
- **"+N more" popups:** without a link between button and popup, only a popup that lists events is closed, never one
  you opened for something else.
- **Send to Jira** shows in its tooltip exactly what is written, including the comment, and when touching blocks of
  the same issue are sent together as one worklog.
- Times must be 00:00–24:00; project names from Jira can't clash with built-in names in the charts.

### Removed
- The old Python version (`app/`, `static/`, `tests/`, `run.bat`, `requirements.txt`) is no longer part of the
  repository.

## [1.32.0] - 2026-11-25

### Added
- **"Internal" type of work.** Internal projects now have their own category on the Charts page (*Time by type of
  work*, own colour), instead of counting as General. It is the default for internal issues; Projects → Internal
  projects → **Chart** can still set an issue to General, Pre-sale, Project or Installation. *General* is now only
  time on issues outside your projects. Phases (Settings) can use the new type too.
- **"Training" type of work**, with its own colour: set an internal issue's **Chart** to Training and its hours show
  as training on the Charts page.
- **Absence issues count as vacation.** An internal issue's **Chart** can be *Vacation / absence* (e.g. a leave or
  permit issue for a medical visit): its hours show in the *Vacation / absence* category and slice, and not also
  under its project.

## [1.31.1] - 2026-11-23

### Changed
- **Send to Jira** sits in the same row as Don't fill / Cancel / Save, and sends with one click (that click is your
  approval of this one worklog; hover it to see exactly what is written). When it can't send (not happened yet,
  Jira not connected) it is greyed out and says why on hover.

## [1.31.0] - 2026-11-23

### Added
- **Send one worklog to Jira from its box.** Clicking a blue "to fill" block (or a vacation block) now also shows
  **Send to Jira…**. The first click shows exactly what will be written (hours, issue, time); the second click
  sends that one worklog, through the same checks as Review & approve. Not for events that haven't happened yet,
  and not with unsaved changes in the box (press Save first).

## [1.30.0] - 2026-11-23

### Added
- **Chart type for internal issues.** Projects → Internal projects has a **Chart** column: choose where an internal
  issue's hours count on the Charts page (*Time by type of work*): general (default), pre-sale, project or
  installation. The choice is kept when projects are detected again.

### Fixed
- **An event without a project keyword that you assigned by hand came back orange** ("nothing at this time"),
  because only events with a project were compared with Jira. Now every calendar event is compared: a worklog
  with the event's title at its time matches it. Such an event that is already in Jira is no longer shown as
  "not matched", and assigning a "not matched" event now replaces it (remembered, also after posting).

## [1.29.1] - 2026-11-23

### Fixed
- **Worklogs Timefill posted came back orange.** Two events of the same project back to back (e.g. 9–10 and
  10–11) are posted as one worklog (9–11, comment "A; B"); read back from Jira, that worklog matched neither event,
  so one correct worklog gave three orange warnings. The same happened with two all-day events of one project, and
  with time you assigned yourself (comment "manual"), which has no calendar event. Now:
  - when posting, Timefill remembers which calendar events (or your entries) each worklog came from; read back
    from Jira, the worklog belongs to exactly those, also after you move or resize it through Timefill;
  - worklogs posted before this version: one whose comment lists several events ("A; B") matches them when
    together they cover it; one you assigned by hand ("manual") is not compared.

## [1.29.0] - 2026-11-20

### Added
- **Show: Both / Jira / Outlook** above the Status calendar: everything, only what is already in Jira (and missing
  time), or only your calendar (blocks to fill, vacation, events without a project). Orange differences show in
  every view. The choice is remembered in this browser.
- **Frozen day headers.** The calendar scrolls on its own; the day headers and the all-day row stay on top while
  you scroll the hours (like frozen rows in a spreadsheet). A redraw keeps your scroll position.

### Changed
- **Hours per project shows more projects.** Colours your main projects don't use in the selected period go to that
  period's next biggest projects, so up to six projects are shown on their own and "Other projects" stays small.
  Your main projects keep their colour everywhere.

### Fixed
- **An ignored difference stays ignored** also when the worklog gets another id (a worklog Timefill just posted
  gets its real id when Jira is read again). Differences are now remembered by issue, start and length; ignores
  saved by older versions still count. Ignores are kept in this Chrome profile, also after closing Timefill.

## [1.28.1] - 2026-11-20

### Fixed
- **Your own calendar was taken for someone else's** ("not read now: Deselect calendar 'Calendar' also shown").
  Outlook labels each tick box with what a click does: "Deselect calendar 'Calendar'" when it is ticked, "Select
  calendar 'Colleague'" when it isn't (Italian: "Deseleziona calendario 'Calendario'"). Timefill now takes the
  name from the quotes and the ticked state from that label.
- **Your own calendar is never unticked.** If Timefill can't find your calendar ticked in the list (another name),
  it unticks nothing and stores nothing, and says which calendars it found, so you can add your calendar's name in
  Settings → Your calendars. If your calendar were no longer ticked after unticking the others, nothing is read.

## [1.28.0] - 2026-11-20

### Fixed
- **Your own events were left out with only your calendar ticked** (e.g. "2 from other calendars left out · 6 not
  sure"). A per-event colour is not a sign of whose calendar it is: Outlook shades past and future events
  differently, and categories change colours. Also, the selected day of the small month calendar was taken for a
  ticked calendar.

### Changed
- **Only Outlook's calendar list decides.** The colour, memory and event-card checks are removed. Only real
  calendars in the list count (never a day, a date or a weekday):
  - only your calendar ticked: every event on the page is yours, nothing is left out, nothing is "not sure";
  - other calendars ticked too: they are unticked for the moment of the read, then ticked again (also if the read
    fails); a read made while another calendar is still shown is never stored. Not while you type or have a form
    open in Outlook, and not again for the same week within 5 minutes after Timefill's own unticking.
  - The badge says "only your calendar (N others unticked for the read)". The stored per-event memory is deleted.

## [1.27.3] - 2026-11-20

### Changed
- **The Timefill badge in Outlook shows the reading.** Its dot is red (blinking) while Timefill reads the calendar
  and turns green when it is done; the text says which days were read, e.g. "read 16–22 Nov · 35 events" (and how
  many events of other calendars were left out). If a read fails, the badge says so.

## [1.27.2] - 2026-11-20

### Changed
- **Select all in Approve worklogs** is now a checkbox in the **Approve** column header (half-ticked when only
  some are ticked). It selects every worklog that has already happened; later ones stay unticked. The **Approve
  all** button at the bottom is gone. Nothing is sent until you press **Post approved to Jira**.

## [1.27.1] - 2026-11-20

### Fixed
- **Vacation blocks can be changed.** Click a vacation block to change its project, phase or time, drag it,
  resize it, or choose **Don't fill**, like any other block. A vacation day you don't fill shows in the all-day row
  (crossed out) with ↺ to fill it again.
- **Calendar colours are compared by their colour code, whatever the darkness.** Outlook draws a calendar's events
  in its colour and only makes events that already happened darker, so an exact match missed them. Now the hue and
  the saturation decide, not how light or dark: a darker brown is still that brown calendar, and brown is still not
  orange. Greys have no colour to compare.

## [1.27.0] - 2026-11-20

### Removed
- **The Microsoft sign-in** (Calendar source → Microsoft, added in 1.26.0): the settings, the sign-in, the
  `identity` permission and the Microsoft addresses are gone, and a stored sign-in is deleted. Timefill reads only
  the Outlook web page again.

### Changed
- **Only your events, from the Outlook page, also when other calendars are ticked.** Outlook links a ticked
  calendar and its events by colour, but your own events can have the same colour (the same blue, or a category
  colour), which made Timefill drop some of yours. Now, in this order:
  1. events read while only your calendar is ticked are remembered as yours, together with their colours;
  2. an event in the colour of one ticked person's or team calendar, a colour your own events don't use, is theirs;
     one in a colour only your events use is yours;
  3. otherwise the card Outlook shows when pointing at the event tells the calendar (first line); only when
     Timefill asks or the Outlook tab is in the background, and remembered.
  Events still not sure are not added (one stored by an earlier read stays). The badge in Outlook says how many
  were left out and how many were not sure. The memory stays in this Chrome profile (150 days).

## [1.26.0] - 2026-11-20

### Added
- **Read only your own calendar, from Microsoft.** Settings → **Calendar source → Microsoft (only my own
  calendar)**: Timefill asks Microsoft Graph for the events of your own default calendar (`/me/calendarView`,
  read-only `Calendars.Read`). Other people's, shared and group calendars are never part of it, whatever Outlook
  shows, and no Outlook tab is needed. While this is on, the Outlook page is not read or stored at all.
  - One-time setup: an app registration in Microsoft Entra ID (single-page application, redirect URI shown in
    Settings), its client ID and tenant in Settings, then **Sign in to Microsoft**. Steps in the README.
  - Sign-in with PKCE in Chrome's own sign-in window (no secret); the token is renewed by itself and kept only in
    this Chrome profile. New permissions: `identity`, `login.microsoftonline.com`, `graph.microsoft.com`.
  - All-day events keep their dates as Outlook shows them (several days = every day); cancelled and declined
    events are read as such and never proposed.

## [1.25.0] - 2026-11-20

### Changed
- **Other calendars shown in Outlook: reading goes on, their events are left out.** Timefill no longer stops
  reading or switches calendars off. For each event it finds the calendar:
  - by colour: the event's colour is matched with the colours in Outlook's calendar list;
  - when two calendars share a colour: by the card Outlook shows when pointing at the event, whose first line is
    the calendar ("Calendar", "Calendario", or the other person's name). Timefill points at events only when it
    reads at your request or while the Outlook tab is in the background, closes every card again, and remembers
    the answer per event.
  Events of a calendar that isn't yours (Settings → Your calendars, English and Italian names) are not stored;
  events it can't place are kept. The badge says how many were left out. Diagnose shows `calendarColours` and
  `eventCalendars` (which calendar each event was given, and how).

## [1.24.2] - 2026-11-19

### Changed
- **No company, customer or person names in the code and tests.** Examples and test data use neutral names only
  (e.g. "Big Job demo", "Alpha training", `PRJ-226`, "Colleague"). The copyright notice is unchanged.

## [1.24.1] - 2026-11-19

### Fixed
- **Other people's calendars were still read.** Outlook's calendar list uses `button[role="option"]` with
  `aria-selected`, which Timefill didn't look for (so a colleague's calendar wasn't noticed, and "Deselect all
  calendars shown" was taken for a calendar). Events of another calendar look exactly like yours, so now:
  - every calendar that isn't one of yours (Settings → Your calendars, default "Calendar") is clicked off,
    Timefill waits until Outlook has redrawn, reads (including "+N more"), and clicks them on again, even if the
    read fails; the badge says "reading only your calendar (hid N shared calendars temporarily)";
  - this happens only when Timefill asks (Status page, Refresh) or while the Outlook tab is in the background,
    and not again for the same week within 5 minutes on automatic reads, so it never flickers in front of you;
  - a read made while another calendar is still shown is never stored.

## [1.24.0] - 2026-11-19

### Added
- **Other people's calendars are not read.** If Outlook also shows another calendar (ticked in its calendar
  list, e.g. a colleague's), Timefill doesn't read the page or store anything until you untick it; the Status page
  and the badge in Outlook say which calendar. Names of your own calendars go in Settings → **Your calendars**
  (default: Calendar / Calendario / Kalender / Calendrier). Holidays and birthdays calendars are always fine.
  Diagnose lists the calendars Timefill sees as shown (`calendarsShown`).

### Fixed
- **Grouped all-day events (+1 / +3) in the new Outlook.** One click on any "+N" expands the whole all-day row
  and the other "+N" buttons disappear. Timefill clicked the buttons it had found before, which no longer
  existed, and could read before Outlook had redrawn. Now it clicks one button at a time (looking them up again
  each time), waits until the row is expanded (or a popup opened), then reads. A multi-day event shown as one
  element is stored on every day it covers.

## [1.23.1] - 2026-11-19

### Fixed
- **Hidden all-day events were lost again after an automatic read.** While Timefill is open, it re-reads the
  Outlook page by itself when the page changes, but only clicked the "+N more" boxes when you opened the Status
  page or pressed Refresh. An automatic read then stored the day without its hidden all-day events. Now:
  - the automatic read also opens the "+N more" boxes, when the Outlook tab is in the background or not focused
    (never while you are working in it, so no popups appear in front of you);
  - a read that couldn't open a day's "+N more" keeps the all-day events stored for that day instead of
    wiping them.
- **Find a project in Jira by its key.** Searching an issue key (e.g. `PRJ-226`) finds that issue and its
  project; a Jira project key on its own (e.g. `PRJ`) lists that project's issues. Before, only issue names were
  searched.

## [1.23.0] - 2026-11-19

### Changed
- **Blocks from all-day events are edited like any other "to fill" block.** Click one to change its project,
  phase or time, drag it to move it, drag an edge to resize it, or choose **Don't fill**. The change is for that
  day only, and the day's other all-day events keep the hours they have (they don't grow to fill the gap).
- **The day's all-day chooser opens only from the all-day row** (the chips at the top of the day), not from the
  blocks. An event you changed on the calendar shows ✎ there, "changed on the calendar" in the chooser, and
  **back to automatic** to undo it; one already posted shows ✓.

## [1.22.1] - 2026-11-19

### Fixed
- **All-day events hidden behind "N more events from <day>" were lost.** In the new Outlook, a full all-day row
  hides events behind such buttons. Timefill clicked them, but:
  - it didn't click at all when Outlook kept a hidden dialog or menu in the page (it took that for "you are busy");
    only popups you can see count now;
  - it read 0.7 s after the click; it now waits up to 3 s for the popup;
  - the popup may list its events without a date; they are now read as events of the button's day
    ("3 more events from Wednesday, November 04, 2026" → 4 Nov);
  - a button that showed nothing is tried again on the next read (up to 3 times).
- **Which week is on screen,** when Outlook shows no day headers and no date in the address: now taken from the
  "N more events from <day>" buttons, else from the week most timed events are in. A long all-day event that
  started weeks earlier no longer marks (and overwrites) a week that isn't on screen.
- **"OOF" means out of office** (Outlook writes it that way in some labels).
- **Settings section titles** sit inside their box instead of on its border.

### Added
- Diagnose shows `lastRead`: what the last read found behind the "N more events" buttons (buttons clicked, whether
  it was skipped and why, and every label in the popups with how it was read).

## [1.22.0] - 2026-11-19

### Added
- **Fill a calendar event that isn't in Jira.** The orange popup of such an event now has **Fill it** (proposes it
  on its project, at its time) and **Other project…** (the usual project – phase box), next to **Ignore**. This
  covers events on a day that already has its hours, which Timefill doesn't propose by itself. The worklog still
  goes through Review & approve.
- **Diagnose: look for an event.** Settings → Diagnose Outlook page has a box for an event title. The output lists
  every element on the Outlook page with that text (tag, role, aria-label, title, text) and why it is or isn't
  read. It also lists every all-day event read, and the all-day labels that were not read, with the reason.

### Fixed
- **What you assign yourself is kept on a day that already has its hours.** Before, such an entry was dropped
  without a word.

## [1.21.2] - 2026-11-19

### Fixed
- **A problem in one day can no longer blank the Status page.** Each day, and each block in it, is drawn on its
  own: if one fails, it is left out, the error is logged in the console (F12) and a banner names the day, and
  the rest of the week is shown. If the whole page can't be drawn, it says so (with the error) instead of
  staying empty, and any other unexpected error is shown as a message.
- **Slow Outlook reads no longer move the Outlook tab.** Reading a week with many "+N more events" buttons can
  take a while; Timefill now waits up to 30 s, and only moves a tab to another week when the tab was read and
  clearly shows a different week.

### Changed
- The list of a day's all-day events is now called `candidates` in the plan data (`day.candidates[]`).

## [1.21.1] - 2026-11-19

### Fixed
- **Blocks are centred in their day.** They had 4px of space on the left and 8px on the right; now the space is
  the same on both sides, also when several blocks sit side by side.

## [1.21.0] - 2026-11-19

### Changed
- **All-day events: every one is kept, and you choose.** A day no longer takes just one all-day event. Each
  all-day event of a working day is a candidate, shown in the day's all-day row: two events with similar titles
  (e.g. "Big Job demo" and "Big Job") are two candidates, and Free events are kept too. Only the title + start +
  end identify an event, never the day, project or keyword. An event over several days is a candidate on each
  working day, with the same identity.
  - Busy / tentative / out-of-office events with a project start ticked; Free ones, and ones without a project,
    start unticked.
  - Ticked events share what the day still needs: working hours − what is in Jira − timed events of that day
    (including events still without a project). Two ticked events on an 8-hour day = 4h + 4h.
  - Click a candidate (or a block it filled) to tick / untick, choose the project and phase, or type the hours.
    Typed hours are kept even beyond the working day; **Reset day** goes back to the default split.
- **Taller hours** on the Status calendar, so a 30-minute block shows its title, project and time in full.

### Fixed
- The Outlook reader and the stored calendar now tell events apart by title + start + end (before: title +
  start), so two events with the same title and start but a different end are both kept.

## [1.20.0] - 2026-11-19

### Added
- **Trace in the console.** Each time Timefill reads Outlook or Jira, the Timefill tab's console (F12) shows a
  collapsed **[Timefill] trace** for the week: (a) Outlook labels read before and after expanding "+N more events",
  (b) events found, all-day ones included, (c) what the declined / cancelled / Free filter removed, (d) the keyword
  match of every all-day event (project and issue, or why not), (e) hours proposed per day, including the all-day
  fill. The Outlook tab's own console logs what it read, too.
- **The week you look at is read from Outlook.** If none of your Outlook tabs shows the week you open in
  Timefill, one is moved to that week (only the view changes) and read when it has loaded. This happens when you
  open the Status page, press Refresh, or go to a week that was never read. It is skipped while you are typing or
  have a form open in Outlook (the Status page says so), and no new tab is ever opened. Reading the page is kept
  instead of Microsoft Graph, which would need its own sign-in.

### Changed
- **No warning for a longer or shorter worklog.** A worklog and a calendar event of the same project where one
  covers the other, and the extra time doesn't run into any other event, now count as the same thing.
- **Side by side, like Outlook.** Everything at the same time on the Status calendar (worklogs, blocks to fill,
  missing time, events without a project) now gets its own lane next to the others, and a day with more of
  them gets a wider column. Blocks also have a small gap around them, so ones that follow each other are easy
  to tell apart.

## [1.19.1] - 2026-11-19

### Fixed
- **Charts calendar circles.** The circles for today, the selected day and the hover outline were oval, and the
  numbers were off-centre. Every day number now sits in the same round box, centred.

## [1.19.0] - 2026-11-19

### Added
- **Jira vs. calendar check.** Worklogs in Jira that have no calendar event at that time, and calendar events of
  your projects that are neither in Jira nor proposed, are shown in orange. Click one to see what Jira has and what
  your calendar has, then **Ignore** it if it's fine. A **not like calendar** button lists all of the week's
  differences, with **Ignore all** and **Show ignored again**. Ignoring changes nothing in Jira or Outlook.

### Changed
- **The first line of a block is your calendar event's name**, also for worklogs already in Jira (it used to
  repeat the Jira issue name). A worklog with no matching event shows its Jira comment, or else the project and phase.
- **Events at the same time are no longer split.** Each is proposed in full and drawn side by side, like in
  Outlook. Drag or resize them to split the time yourself. Your manual entries and existing worklogs still come first.

### Fixed
- **Several keywords for one project.** Commas now always separate keywords, also in lists saved by older
  versions, so `big job, bj` matches either word.

## [1.18.0] - 2026-11-19

### Added
- **Approve all** button in *Approve worklogs*. It ticks every worklog that has already happened (later ones stay
  unticked); press it again to untick them all. Nothing is sent to Jira until you press **Post approved to Jira**.

### Changed
- **Calendar blocks read in a new order:** first the name of the calendar event, then the project and phase
  (with the issue key), then the time, length and state. Worklogs that have no calendar event show the project
  and phase first.

## [1.17.1] - 2026-11-16

### Changed
- **Charts read Jira only once.** The Charts page reads your hours from Jira the first time you open it after
  starting Timefill. Switching to another page and back now shows the same data straight away. It reads Jira
  again only when you press **↻ Refresh** or open Timefill again.

## [1.17.0] - 2026-11-16

### Changed
- **15-minute steps.** Dragging, resizing and selecting part of a missing block now move in 15-minute steps
  (hold Alt for 5). The assign popup's time fields and its −/+ buttons also use 15 minutes.
- **Taller week calendar.** Each hour is drawn larger, with faint quarter-hour lines, so short blocks are easier
  to read and to grab.
- **The week calendar always shows 07:00–20:00** (it was 07:00–18:00). It still grows for earlier or later work.

## [1.16.1] - 2026-11-16

### Fixed
- **Notifications were hidden** behind the sticky header and calendar blocks, and long ones were hard to read.
  They are now drawn above everything, with larger text that wraps and a shadow. The edit popup and the hover
  tooltip are also raised above the page.
- **Uneven spacing in the Charts calendar.** Day columns now all have the same width. Today is marked only by
  the dark circle; the yellow background from the Status page no longer leaks into it.

### Removed
- The "Designed by Aria Behnam" line at the bottom of the app. The copyright notice stays in the source files
  and the README.

## [1.16.0] - 2026-11-16

### Added
- **Phases & roles are fully configurable** (Settings → *Phases & roles*). This replaces the fixed E/M and
  phase-word fields.
  - **Roles:** the name in Jira summaries (e.g. `SD`), a display name, the event-title words that choose it
    (e.g. `E`), and which role is the default.
  - **Phases**, in lifecycle order (reorder with ↑ ↓): the name in Jira (e.g. `EXEC`), the status name shown
    (e.g. *Project*), title words (e.g. `installation`), and which type of work it counts as on the Charts page.
  - Phases and roles can be added or removed. Title words saved by earlier versions are carried over.
- Charts calendar: **click a week number** to select that week, **a day** to show only that day, or the month name
  for the whole month. The selected period, its numbers, the dot legend and the instructions are now on the
  right of the calendar instead of below it.
- **Lunch break:** setting the same start and end time means no lunch break. A lunch that ends before it starts
  is refused.
- **Copyright:** "Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam." at the top of every source file, an
  `author` entry in the manifest, and a small credit at the bottom of the app.

### Changed
- **README rewritten** as a short, plain guide: what Timefill does, install, first-time setup, everyday use, how
  an event becomes a worklog, projects, charts, privacy and maintenance.
- **No company or project names** in code, tests or docs any more. Examples use neutral placeholders such as
  *Big Job*, `PRJ-1` and `LEAVE-1`.
- **Defaults are generic.**
  - Projects query: `assignee = currentUser() ORDER BY key`.
  - No preset vacation issue and no preset project-code field; set both in Settings.
  - Values you have already saved are not changed.
- Phase words choose the requested phase first, then another phase of the same type of work (e.g. feasibility →
  pre-sale), as set in the Phases table.

## [1.15.0] - 2026-11-13

### Fixed
- **All-day events with a project keyword proposed 24 hours a day.** Since 1.6.0 (work outside working hours
  counts), an all-day event like `Delta demo, all day, Wed 4 → Fri 6 Nov, Busy` was proposed as 00:00–24:00
  on every day. Each working day in the range (end date inclusive) is now filled with that day's working hours
  from Settings, 8h or 7h on Friday, giving 3 days × 8h with 8h Fridays. From that, Timefill subtracts the
  hours already in Jira that day and the time other events of that day take.
  - Weekends and holidays get nothing.
  - Lunch is never filled.
  - Timed events of that day keep their own slots, and the all-day event fills the rest.
- An all-day *Out of office* event with a project keyword (e.g. "Delta commissioning", on site) was turned into
  vacation. The project keyword now wins; without a keyword it is still vacation.

### Added
- **Phase words in the event title** pick the phase over the project's status. The lists are editable in
  Settings → *Matching rules*. Matching is whole-word and ignores case.
  - `sdf` / `feasibility` / `fattibilità` → SDF, or INIT when the project has no SDF phase
  - `pre-sale` / `presale` / `prevendita` → INIT
  - `project` / `progetto` → EXEC
  - `commissioning` / `installation` / `installazione` / `collaudo` → COMM
  - Example: `Delta E installation check` → COMM · SD.
  - If that phase doesn't exist in Jira, the event is shown as *not matched* with the reason, never silently
    put on another phase.
  - The assign box's detected phase (★) uses these words too.
- Outlook reader: **"N more events from …"** buttons (and the Italian "altri N eventi da …") are clicked too, so
  hidden all-day events are read. This still happens only when Timefill reads the week, never while you are
  working in Outlook.
- Status calendar: **hour lines over the events**, with fainter half-hour lines, so start and end times are easy
  to read. Event blocks are a little narrower, so the day separators and lines stay visible.

### Changed
- All-day events without a project keyword (e.g. long reminders shown as *Free*, like "Showroom reminder") are
  explicitly ignored and never fill days.
- The Status totals say "already logged" (was "in Jira"), matching the legend.

## [1.14.0] - 2026-11-13

### Added
- **Pick a week or month** on the Charts page: a new top-left square with a small month calendar, like Outlook's
  date picker.
  - It shows week numbers, ‹ › to change month, today circled and the selected week highlighted.
  - Click a week row to select that week, or the month name to select the whole month. *This week* jumps back.
  - Dots under each day show its state: blue = all hours in Jira, half blue/orange = partly, orange = nothing.
  - Below the calendar: placed, missing, vacation and expected hours for the selection.
- The selection drives the pie and is highlighted in both bar charts. A selected month highlights its weeks, and
  a selected week highlights its month. Clicking a bar selects that week or month. ‹ › on the pie step to the
  previous or next period.

### Changed
- **Vacation is part of "Hours per project"** as its own slice, always in the same colour. Projects now take six
  fixed colours (checked again for colour blindness with vacation reserved), and the rest is "Other projects".
- **Layout: four equal squares.** Calendar and pie on top, placed/missing and type of work below. Bar charts are
  drawn to the width of their card and redrawn when the window is resized, so they fill the space instead of
  sitting in a corner. The pie scales with its card. Narrow windows show one column.
- The pie's own Week/Month switch and period list were replaced by the calendar selection. Each bar chart keeps
  its own Week / Month switch.

## [1.13.0] - 2026-11-13

### Added
- **Charts page** (new *Charts* tab). It shows your hours in Jira since *Track from*. Jira is read when you open
  the page or press *↻ Refresh*, and switching charts or periods makes no new Jira calls. Each chart has its own
  **Week / Month** switch, a legend, hover details and a *Show as table* view.
  - **Hours per project**: a pie for the week or month you pick, with hours and share per project. Each project
    keeps the same colour in every period; projects beyond the 7 biggest are grouped as "Other projects".
    Vacation is listed under the chart, not in it.
  - **Placed and missing hours** per week or month. Missing is the expected hours not in Jira, for finished days
    only.
  - **Time by type of work** per week or month:
    - Pre-sale: INIT and SDF (feasibility) phases
    - Project: EXEC
    - Installation: COMM
    - General: internal projects, and issues outside your projects
    - Vacation
  - Chart colours come in a fixed order that passed a colour-blindness check. *Missing* is hatched blue/orange
    rather than green/red, which deuteranopes can't tell apart.
- **Leave days are fully booked.** A day with an all-day out-of-office (vacation) event in Outlook and a worklog
  on the leave issue (`LEAVE`) in Jira is shown as *on leave*. Nothing more is proposed and nothing is missing,
  even if the leave worklog is shorter or starts at another time.

### Changed
- Worklogs already in Jira are labelled **already logged** on the Status calendar (was "in Jira"). This covers
  every project, including `INT` internal tasks and `LEAVE` leave. They are still loaded with
  `worklogAuthor = currentUser()` plus a `worklogDate` range over all projects. Then each issue's worklogs are
  read, and only yours inside the range are kept. Their time is never proposed again.

## [1.12.0] - 2026-11-13

### Changed
- **The Status page is much faster.** Before, every change (assigning time, dragging or resizing a block, undo,
  *Don't fill*, approving) redrew the page from scratch. Each redraw asked every Outlook tab to read the
  calendar again and downloaded all your Jira worklogs for the week again.
  - Outlook and Jira are now read only when you **open the Status page**, press **↻ Refresh**, or go to a week
    that hasn't been read yet.
  - Every other change redraws instantly from the data already read, with no network calls. Your scroll position
    is kept, and the "Reading calendar and Jira…" placeholder no longer flashes.
- After Timefill changes Jira itself (posting approved worklogs, moving or changing a worklog), it updates its
  copy of your worklogs directly instead of downloading them again.
- Posting still re-reads Jira right before it writes, so nothing is logged twice.
- The *↻ Read Outlook* button is now **↻ Refresh**. It reads your Outlook tab and Jira again. The Status page
  shows when Jira was last read ("Jira read 10:32").
- Changing the Jira site, sign-in method or e-mail drops the worklogs read from the previous one.

## [1.11.2] - 2026-11-13

A full security review of `extension/` found **no malicious or suspicious code**: no third-party hosts, no remote code,
no `eval` or obfuscation, and nothing referring to networks, IPs or shells. Commit `597b7d9` has a pasted shell command
as its message but contains only the 1.9.0 changes. The review did find the weaknesses below, which are fixed here.

### Security
- **The Jira URL check could be bypassed** (medium). The old pattern accepted `https://evil.com?.atlassian.net` and
  `https://evil.com#.atlassian.net`, which would have sent the API token to `evil.com`. The URL is now parsed. It must
  be `https://<name>.atlassian.net` with no user, port, path, query or fragment. It is checked when saving, before
  every request, and in the Jira client itself. Only the bare origin is stored.
- **"+N more" clicking could disturb your work in Outlook** (medium).
  - Hidden events are now expanded only when Timefill asks for the week (opening the Status page, *Read Outlook*),
    not on every change in the Outlook page.
  - Nothing is clicked while you are typing or while any form, peek or popup is open.
  - Escape is sent only to a new popup that lists events and belongs to the clicked button.
- "+N more" buttons are only looked for inside the calendar (`[role="main"]`), and "Show N more …" must be about
  events. Before, "Show 3 more replies" or an attendee "+3" in a peek could match.
- Moving a worklog to another issue checks that the worklog is yours against the account signed in right now, not
  a cached account id. The cached id is also cleared when you change the Jira site, sign-in method or e-mail.
- An approval now covers the worklog comment. If the calendar title changes between *Review & approve* and posting,
  the entry is skipped and needs a new approval, instead of being posted with a different comment.
- Jira links on the Projects page are escaped, and issue keys in them are URL-encoded.
- "Open week in Outlook" can only open Outlook web addresses.

### Fixed
- Chrome showed *Unchecked runtime.lastError: The page keeping the extension port is moved into back/forward cache,
  so the message channel is closed.* It appeared when the Timefill tab navigated away or was suspended. Both ends of
  the Outlook connection now handle Chrome closing it. When the Timefill page is suspended, it closes the
  connections itself, so Outlook stops reading, and reconnects when you come back.
- Two Status page actions ("↺/×" undo and *Open week in Outlook*) now show an error message if they fail, instead of
  failing silently. The badge in Outlook no longer causes an error after the extension is reloaded.

## [1.11.1] - 2026-11-13

### Fixed
- Chrome showed an error, *Cannot set properties of null (setting 'disabled')* in `app.js`, when you left the
  Status page, or it was drawn again, before Jira and Outlook had answered. Examples: switching to Projects or
  Settings while the week was loading, or clicking ‹ › quickly. The late answer tried to update buttons that
  no longer existed. Every page draw now gets a ticket, and an answer that arrives after you moved on, or after
  a newer draw, is dropped. Projects and Settings are protected the same way, so a slow answer can no longer
  overwrite the page you switched to.

## [1.11.0] - 2026-11-13

### Added
- **Assign only part of a missing slot.** Drag over a red *missing* block to select a range. It snaps to
  30 minutes and shows its length while you drag, and stays inside the slot. Releasing the mouse opens the
  assign box for exactly that range. A plain click still takes the whole slot.
- The assign box has **from / to** times (30-minute steps) and **−30 min / +30 min** buttons, so the length
  can be changed before assigning. Before, the whole missing slot was always assigned.

### Changed
- Dragging and resizing blocks on the Status calendar now uses **30-minute steps** by default (was 15). Hold
  **Shift** for 15-minute steps or **Alt** for 5.

## [1.10.0] - 2026-11-13

### Added
- **Find a project in Jira** (Projects page): search Jira by project name or code. The search covers every
  status and isn't limited to issues assigned to you. Hits are grouped into projects: an epic, the epic of a
  matching child issue, or a standalone issue. *Add to my list* adds the project with all its phases, and
  it stays on every refresh. Added projects carry an *ADDED* tag and a *Remove* button.
- **Change the project or phase of a worklog that is already in Jira.** Click a green *in Jira* block, or
  drag it, to open one box with project, phase and times. Jira can't move a worklog between issues, so
  Timefill creates it on the new issue with the same time and comment, and then deletes the old one. This
  happens only after *Update in Jira*. If the old worklog can't be deleted, Timefill says so, so it doesn't
  silently count twice.

### Changed
- **The assign and edit boxes use Project → Phase** instead of one long list of every issue. Pick the
  project, and the phase is detected and preselected (marked ★), from `E`/`M` in the event title and the
  project's status. For internal projects it uses the issue keywords. You can pick another phase. This
  applies to *missing* and *not matched* blocks, *to fill* blocks and *in Jira* blocks. Vacation is in the
  list as its own project.

## [1.9.0] - 2026-11-13

### Changed
- **Events over lunch count in full.** The lunch break is no longer cut out of calendar events that overlap
  it, so an event 12:00–14:00 with lunch 12:30–13:30 is 2.0h (was 1.0h). Lunch is still never used for missing
  time or vacation. With *Outside working hours* ticked, events are cut at the day's start and end only.
- On the Status calendar, events are drawn above the lunch band. The band only marks lunch time that nothing
  is booked on.
- **Issues are shown as `<project name> – <phase>`** everywhere: issue pickers, calendar blocks, the review
  list, the move popover, messages and the Projects tables. The phase is the summary text after ` · `, and
  the project is the epic summary or the code prefix. The issue key is shown next to it as small text.
  Pickers are searched by that title. Titles come from the stored projects and from the summaries Jira
  already returns with your worklogs, cached in `issue_titles`, so there are no extra Jira requests.
- The Status calendar is taller (76 px per hour, was 52), so event titles are easier to read. Long titles
  now wrap.

### Fixed
- Outlook parser: Outlook's overlap group labels (`1:00 PM to 3:00 PM, 3 events, 2 busy, …`, also 24-hour
  and Italian variants) are skipped. They describe several events at once and are not events themselves.
  *Diagnose* counts them as `groupLabelsSkipped`.
- Outlook parser: events whose title is empty, or only a number or year (e.g. `2026`), are skipped.

## [1.8.0] - 2026-11-13

### Added
- **Change "to fill" blocks before approving them** on the Status calendar.
  - Click a blue block to pick another Jira issue (when the project or phase was detected wrong), type
    other times, or choose *Don't fill*.
  - Drag a block to move it, also to another day, or drag its top or bottom edge to change its length
    (15-minute steps, Alt for 5).
  - Changes are stored in Timefill only. They reach Jira only when you approve them in *Review & approve*.
  - A changed block replaces its calendar event, including the event's other pieces around lunch. Reading
    Outlook again doesn't undo it, and after posting the event doesn't come back at its old time.
  - **×** on a changed block undoes the change. An event set to *Don't fill* stays as a faded, crossed-out
    marker, and **↺** fills it again.
  - Manual entries made from *missing* or *not matched* blocks can be dragged and edited the same way.

### Changed
- **Keywords with several words need all of them.** `echo plc` now matches only titles that contain both
  "echo" and "plc", in any order. Before, the exact phrase had to appear. A title with only "plc" no longer
  goes to that project. Each word must start a word in the title, so `bravo` still matches *Bravo* but
  `plc` doesn't match *complc*. When several keywords match, the one with the most words wins, then the
  longest. Commas still separate keywords.

## [1.7.1] - 2026-11-13

### Fixed
- A study/feasibility epic and the project epic of the same job showed as two projects when only the project
  epic's code had a number, e.g. `26.006 - Echo Line 2` (STUDY-77) and `26.006.P06 - Echo Line 2`
  (PRJ-227). An epic with only the base code `xx.xxx` now joins the project epic `xx.xxx.Pnn`. The project
  is shown under the **more complete** epic, and the study epic's phases and hours stay in it. Project epics
  with different numbers (e.g. `26.020.P01` and `26.020.P02`) stay separate. If several share the base code,
  the study epic joins the one that is furthest along.
- When merging epics, the one that is further along now decides the project's name, judged by its detected
  status first, not just by which phases exist. A finished feasibility epic no longer outranks the running
  project epic.
- The project list is rebuilt from Jira automatically once after this update.

## [1.7.0] - 2026-11-13

### Changed
- **Timefill reads Outlook only while its tab is open.** The Outlook reader is no longer a permanent content script
  that Chrome starts in every Outlook tab. Opening the Timefill tab injects it into the open Outlook tabs (and into
  Outlook tabs opened later) and keeps a connection to each. When the Timefill tab closes, the reader stops watching
  the page and removes its badge. The badge now only shows while Timefill is open.
- **Auto status follows your hours.** The status is the latest phase that is not Done and where you logged
  hours or work is in progress. Logging time on `EXEC` makes the project *Project*, even while the
  feasibility (`SDF`) is still open. Hours on phases that are already Done don't hold the status back.
- The Status column on the Projects page shows only the selection box. The coloured status label above it
  repeated the same information and was removed.

### Added
- **Move and resize worklogs that are already in Jira** on the Status calendar: drag a green *in Jira* block to
  another time or day, or drag its top or bottom edge to change its length (15-minute steps, Alt for 5). A popover
  shows the old and new time; the worklog is updated in Jira only after *Update in Jira*. Only your own worklogs
  can be changed, the comment is kept, and Jira users are not notified. *Cancel* puts the block back.
- **External / Internal projects.** Customer projects are now called *External* and company work (formerly
  "general projects") *Internal*. Every project has an *Auto / External / Internal* choice under its name. Auto
  means Internal when the project has no `xx.xxx` code. Your choice is kept across refreshes.
- Internal projects are back on the **Projects page**, in their own *Internal projects* section below the
  external ones. Each issue has its own calendar keywords there. The section was removed from Settings.

### Fixed
- The same project appeared twice when its feasibility epic (STUDY) and its project epic (PRJ) had the
  same code (e.g. *Echo Line 2*). Epics with the same code are now one project, named after the epic that
  is later in the phases (SDF < INIT < EXEC < COMM). The earlier epic's phases and hours stay in that
  project, and both epics are linked under its name. Epics that only share the study code (*Project code*)
  stay separate.

## [1.6.0] - 2026-11-12

### Fixed
- **Cancelled and declined events no longer take time from real events.** Events whose title starts with
  `Declined:`, `Canceled:`/`Cancelled:`, `Annullata:`/`Annullato:` or `Rifiutato:`/`Rifiutata:`, also after a
  `… icon, ` part, are removed in the planner *before* overlaps are resolved. Before, a declined meeting that
  matched a project won the overlap as the shorter event. This covers events cached by older versions too.
  Example: `bravo 15:30–17:30` + `Declined: P4 16:00–17:00` now gives bravo 2.0h.

### Changed
- **Work outside the working hours counts normally.** Calendar events were cut to the working hours
  (08:00–12:30, 13:30–17:00), so `bravo 15:30–17:30` became 1.5h. Events are now logged in full, also before
  the day starts, after it ends, and on weekends or holidays. Lunch is still never filled, and vacation still
  fills only the working day (8h, 7h Friday).
- Proposed hours are no longer capped at the day's expected hours, so overtime from the calendar is
  proposed too. A day that already has its full hours in Jira is still complete, with nothing proposed.
- Missing hours are still checked only inside the working hours. They count only what the day still needs
  after Jira worklogs and calendar work, including work outside hours.
- The status calendar grows to show early and late work, from 05:00 up to 23:00.

### Added
- Settings → **Outside working hours**: tick it to cut events at the day's start and end, as before. Off by
  default.

## [1.5.0] - 2026-11-12

### Changed
- **Project status is detected from the phase names.** SDF → *Feasibility*, INIT → *Pre-sale*, EXEC →
  *Project*, COMM → *Commissioning*, plus *Closed*. Other phase names become a status with that name.
  The *Active* status is gone. The status choices for a project are only the phases it has, plus Closed.
  A status set by hand in an older version (e.g. "Commissioning") is carried over.
- The Projects page uses the full window width (was 1180 px). The table has fixed column widths, and the
  status cards and filters are built from the statuses that actually occur.

### Added
- **General projects**: projects with no `xx.xxx` code (e.g. INT "Internal activities") are no longer on
  the Projects page. They are listed in Settings → *General projects*, where each issue can get its own
  calendar keywords. Events with such a keyword go straight to that issue, with no `E`/`M` needed.
- After an update that changes how projects are built, the Projects page re-reads Jira once on its own.

### Fixed
- Two epics with the same *Project code* value (e.g. 26.020.P01 and 26.020.P02, both study 26.020) were
  merged into one project with duplicated phases. Each epic is now its own project. The project code now
  comes from the summary first (`26.020.P02`), and the field is only a fallback.
- A feasibility epic with a single `SDF · SD` phase showed as *Active*. It now shows as *Feasibility*, and `E`
  events go to that phase.

## [1.4.0] - 2026-11-12

### Changed
- **New project model.** A project is now either a **Jira epic** (e.g. PRJ) or a **group of standalone
  issues that share a project code**. The code comes from the *Project code* field, or from the start of
  the summary (e.g. STUDY `26.020 …`). Before, issues were grouped only by parsing their summaries.
- An epic's **phases are all its children** (`parent = <epic>`), whoever they are assigned to. Standalone
  issues with the same code are added as well.
- **Phase labels come from Jira.** The label is the summary text after the project name
  (`INIT · MGMT`, `SDF · SD`, …), so it is no longer limited to the INIT/EXEC/COMM × MGMT/SD grid.
- The Projects table has one **Phases** column listing each phase with your hours. The phases that calendar
  events go to now are highlighted, and Done phases are dimmed.
- The project state (Pre-sale / Project / Commissioning / **Active** / Closed) is shown only in the Status
  column, never in the phase list. Projects without INIT/EXEC/COMM phases are Active or Closed. While
  Active, `E` events go to the open SD phase and `M` events to the open MGMT phase.
- Default projects query now includes STUDY: `project in (PRJ, STUDY) AND assignee = currentUser()`.
  This only applies if you never changed the query.
- *Detect new projects* rebuilds the list from Jira each time. Your calendar keywords and manual statuses
  carry over, also from the previous model. Projects you configured stay in the list even if no longer
  assigned to you.

### Added
- Settings → **Project code field** (default `Project code`).
- New **Active** filter and status card on the Projects page.
- The last-check summary also shows how many epics and code groups were found, and warns when the code
  field is not used.

## [1.3.0] - 2026-11-12

### Added
- The Projects page shows what the last *Detect new projects* found: issues from the projects query,
  issues you logged time on since *Track from* (with the query used and the issue keys), and
  other-phase issues added. If the worked-on search finds nothing, it says so and links to Settings.
- New **Worked on** filter on the Projects page. It lists every project you logged time on, including
  closed ones.
- A note when projects you worked on are hidden by the default *Open* filter because Jira shows them as closed.

### Fixed
- A project you worked on whose only known issue is Done was shown as *Closed* and hidden. Its other
  phase issues are now always looked up, so it gets the right status.
- If the "issues I worked on" query fails (for example because of a bad JQL in Settings), the refresh
  still updates the assigned projects and shows the error. Before, the whole refresh failed.

## [1.2.0] - 2026-11-12

### Added
- Outlook parser: reads the optional **"By &lt;organizer&gt;"** part and the optional **response status**
  (Accepted, Tentatively accepted, Declined, Not responded, and the Italian equivalents). An event with no
  organizer counts as your own event. Neither part is required.
- Outlook tab: clicks **"+N more events"** buttons to read events that Outlook hides (for example a crowded
  all-day row). Each button is clicked once per week shown, and only the popup that click opened is closed
  again. Nothing in Outlook is edited. You can turn this off in Settings → *Hidden events*.
- Diagnose output now includes the organizer, response, "own event", the number of cancelled or declined
  events skipped, and the "+N more" buttons found.

### Changed
- Duplicate events are now detected by **title and start time**, ignoring case. The same title at a
  different time is a separate event.
- A leading `<something> icon, ` part (for example `Recurring icon, `) is removed from event titles.

### Fixed
- Events whose title starts with `Declined:`, `Rifiutato:` or `Rifiutata:` are now skipped, in addition to
  `Canceled:` and `Annullata:`. This also works when the prefix comes after an icon part.

## [1.1.0] - 2026-11-12

### Added
- *Detect new projects* also adds **issues you logged time on**, even if they are not assigned to you,
  tagged *WORKED ON*. The vacation issue is left out. The other phase and role issues of those projects
  are looked up too, so the right issue is picked when the project moves to its next phase.
  The query is set in Settings → *Also add issues I worked on (JQL)*.
- **Track from** setting, default 2026-10-01. Days before it are not checked, Jira worklogs before it are
  not read, and project hours are counted from it.

### Changed
- A day is checked by **hours, not clock times**. If Jira already has the day's full hours (8h, 7h on
  Friday), the day is complete, whatever time those worklogs start. A partly logged day only gets the
  remaining hours proposed or reported missing.
- The status calendar stays between 06:00 and 21:00. Jira worklogs at odd hours are clipped to the edge.

## [1.0.0] - 2026-11-12

### Added
- Chrome extension (Manifest V3) that replaces the Python desktop app.
- Reads the Outlook web calendar from the event accessibility labels (English and Italian) every time
  the week view changes. Never edits Outlook.
- Projects page: Jira issues grouped into projects by summary (`<code> <name> · INIT|EXEC|COMM · SD|MGMT`),
  with Pre-sale, Project, Commissioning and Closed status and your logged hours.
- Status page: a week calendar showing what is in Jira, what is ready to fill, vacation, missing slots
  and events that didn't match a project.
- **Review & approve**: every worklog must be ticked by hand before it is posted. Right before posting,
  Timefill re-checks Jira and skips anything that changed.
- Uses your Jira login in Chrome, with e-mail and API token as a fallback.
