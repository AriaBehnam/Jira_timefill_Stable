# Timefill

**Fill your Jira hours from your Outlook calendar.** Timefill is a Chrome extension. It reads the meetings and
tasks in your Outlook web calendar, matches them to your Jira projects, and proposes the worklogs. You check and
approve each one before anything is written to Jira.

*Designed by Aria Behnam.*

---

## What it does

- **Reads your calendar.** It only reads Outlook web in Chrome and never changes your calendar.
- **Matches events to projects.** An event called `Big Job E design review` goes to the project *Big Job*, the
  engineering role (*E*), and the phase the project is in now.
- **Shows your week.** A calendar view shows what is already in Jira, what is ready to fill, and which hours are
  still missing.
- **Asks before writing.** Nothing goes to Jira until you tick it in *Review & approve*.
- **Handles leave.** All-day out-of-office or vacation events go to your leave issue for a full working day.
- **Shows charts.** Hours per project, placed vs. missing hours, and time per type of work, by day, week or month.

---

## Install

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `extension` folder.
5. Pin the **Timefill** icon (puzzle-piece menu → pin), then click it to open Timefill.

After an update, press the reload icon on the Timefill card in `chrome://extensions`.

---

## First-time setup (5 minutes)

Open Timefill → **Settings**.

1. **Jira URL:** `https://yourcompany.atlassian.net`. Keep *Sign-in* on "Use my Jira login in this Chrome" and
   make sure you are signed in to Jira in the same Chrome. Press **Test Jira connection**.
2. **Projects query:** which Jira issues are "yours". The default is `assignee = currentUser() ORDER BY key`.
   Timefill also adds every issue you logged time on.
3. **Vacation issue:** the Jira issue where you log leave, e.g. `LEAVE-1`.
4. **Phases & roles:** tell Timefill how your issue summaries are written (see below).
5. Go to **Projects** and press **↻ Detect new projects**. Then give each project one or more **calendar
   keywords**. A keyword is a word you use in event titles, e.g. `big job`.

### Phases & roles

Timefill expects Jira issue summaries like this:

```
26.001.P01 Big Job · EXEC · SD
└──── project ───┘   phase  role
```

In **Settings → Phases & roles** you can set:

| | What you set | Default |
|---|---|---|
| **Roles** | the name in Jira, a display name, and the words in an event title that choose the role | `MGMT` (words `M`, `MGMT`), `SD` (words `E`, `SD`) |
| **Phases** | the name in Jira, a display name, title words, and how the phase counts in the charts. The order is the project lifecycle. | `SDF` Feasibility → `INIT` Pre-sale → `EXEC` Project → `COMM` Commissioning |

Add, remove or reorder rows to match how your team works.

---

## Everyday use

1. Open your **Outlook web calendar** in Chrome (Week or Work week view). Keep that tab open.
2. Open Timefill → **Status**. Your week is read from Outlook and Jira.
3. Check the calendar:

   | Colour | Meaning |
   |---|---|
   | green | already logged in Jira |
   | blue | to fill (proposed from your calendar) |
   | purple | vacation |
   | striped red | missing hours |
   | dashed yellow | event without a matching project |
   | orange | Jira and your calendar don't match |

4. Fix anything that's wrong:
   - **Click a blue block** to change its project, phase or time, or choose *Don't fill*. **Send to Jira** in
     that box writes just this worklog to Jira right away (that click is your approval).
   - **Drag a block** to move it, or drag its top or bottom edge to change its length. Steps are 15 minutes; hold
     Alt for 5.
   - **Drag over a red block** to assign part of it, or click it to assign all of it.
   - **Click a green block** to change a worklog that is already in Jira. Timefill asks before it changes Jira.
   - **Click an orange block** to see what Jira has and what your calendar has. For an event that isn't in Jira,
     press **Fill it** (its project, its time) or **Other project…**; press **Ignore** if it's fine as it is. The
     **not like calendar** button at the top lists the whole week.
5. Press **Review & approve**, tick the worklogs you agree with (the box in the **Approve** header selects all), then press
   **Post approved to Jira**.

Use **Both / Jira / Outlook** above the calendar to see everything, only what is already in Jira, or only your
calendar; orange differences show in every view. The day headers stay on top while you scroll the hours.
An orange difference you **Ignore** stays ignored (also after closing Timefill), until you show it again.

Press **↻ Refresh** whenever you changed something in Outlook or Jira yourself.

---

## How an event becomes a worklog

| In the event title | Result |
|---|---|
| a project keyword | that project |
| a role word, e.g. `E` or `M` | that role. Without one, the default role is used. |
| a phase word, e.g. `installation` | that phase, whatever the project's status. Without one, the project's current phase is used. |
| a keyword with several words, e.g. `big job` | matches only if **all** the words are in the title, in any order |
| several keywords separated by commas, e.g. `big job, bj, plant 3` | any one of them chooses the project |

More rules:

- **All-day events: you choose.** Every all-day event of a working day is shown in the day's all-day row, also when
  there are several (e.g. `Big Job demo` and `Big Job`) and also Free ones. Busy and out-of-office ones with a
  project start ticked ☑; Free ones and ones without a project start unticked ☐. The ticked ones share what the
  day still needs (working hours − Jira − timed events of that day), e.g. 4h + 4h. Click one to tick or untick
  events, pick another project and phase, or type your own hours; **Reset day** goes back to the default.
  The blue blocks they make are normal "to fill" blocks: click to change project or time, drag to move, drag an
  edge to resize, or **Don't fill**. The other all-day events of that day keep their hours. A changed one shows
  ✎ in the all-day row; **back to automatic** in the chooser undoes it.
  An event over several days (Wed → Fri) is on each working day; weekends and holidays are skipped.
- **Leave.** An all-day *Out of office* or vacation event fills the day on your vacation issue. If Jira already has
  a leave worklog that day, the day counts as fully booked.
- **Ignored events.** Declined and cancelled events are ignored, and so are events with one of your ignore words.
- **Events at the same time.** Two events that overlap are both proposed in full, side by side, like in your
  calendar. Drag or resize them to split the time the way you want.
- **Hours count, not clock times.** A day that already has its full hours in Jira is complete, even if those
  worklogs start at other times.
- **Outside working hours.** Work before or after your working hours counts normally. You can turn this off in
  Settings.
- **Lunch.** Lunch is never filled with missing time or vacation, but a meeting that runs over lunch counts in full.
  Set the lunch start and end to the same time if you have no lunch break.

---

## Projects

- **What counts as a project.** A project is a Jira **epic** with all its child issues as phases, or a group of
  issues sharing the same project code (e.g. `26.001`).
- **External and Internal.** External projects (customer work, with a code) use keyword + role + phase.
  Internal projects (company work, no code) give each issue its own keywords. You can switch any project between
  them.
- **Status.** A project's status (its current phase) is detected from Jira and from where you logged hours. You
  can also set it by hand.
- **Adding a project.** Use **Find a project in Jira** to search by name, project code or Jira key (e.g. `PRJ-226`)
  and add any project to your list, even
  one that isn't assigned to you.

---

## Charts

Pick a **day, week or month** in the small calendar. Click a week number, a day, or the month name. Then read:

- **Hours per project**, including vacation.
- **Placed vs. missing hours** per week or month.
- **Time by type of work** (pre-sale, project, installation, internal, training, general, vacation / absence) per
  week or month.
  Internal projects count as *internal*; choose another type per issue (e.g. *training*, or *vacation / absence* for a
  leave or permit issue) in Projects → Internal projects → **Chart**.
  *General* is time on issues outside your projects.

Each chart has a *Show as table* view.

---

## Privacy & safety

- **Outlook is only read**, and only while Timefill is open. Timefill never types, saves or deletes anything there.
  The only clicks it makes are on Outlook's own "+N more events" buttons, to see hidden events. You can turn that
  off. When you look at a week your Outlook tab isn't showing, Timefill moves that tab to the week (only the view
  changes), unless you are typing or have a form open there. It never opens a new tab by itself.
- **Only your calendar.** Which calendars are shown is read from Outlook's calendar list (the ticked ones). With
  only your calendar ticked, every event on the page is yours. If other calendars are ticked too (a colleague's, a
  team calendar), Timefill unticks them for the moment of the read and ticks them again, so your view comes back as
  it was; a read made while another calendar is still shown is never stored. Your calendars' names (English and
  Italian) are in Settings → **Your calendars**.
- **Jira is written only after your approval**, one worklog at a time.
- **Data stays with you.** Everything stays in your Chrome profile. Network requests go only to your own
  `*.atlassian.net` site.
- **No API token needed.** Timefill uses your normal Jira login in Chrome. An optional API token is stored only in
  this Chrome profile.

---

## When Outlook web changes

Everything that reads the Outlook page is in `extension/outlook-parser.js`. The settings you may need to adjust
are at the top of that file, in `CONFIG`.

1. With your Outlook calendar open, go to Timefill → Settings → **Diagnose Outlook page**. It shows the raw text
   Timefill sees and how it understood it.
   To see why one event isn't read, type its title in the box under **Diagnose Outlook page** first: the
   output then lists every element on the page with that text, how Outlook labels it, and why it was (not) read.
   All-day events that look like events but were not read are listed under `allDayNotRead`, with the reason.
   For a week that isn't filled as expected, open the Status page on that week, press **↻ Refresh**, and open the
   browser console (F12 → Console). The group **[Timefill] trace** shows each step with counts: labels read
   (before/after "+N more"), events found (all-day ones too), what the declined/cancelled/Free filter removed, the
   keyword match of every all-day event, and the hours proposed per day.
2. Copy a few new labels into `extension-tests/parser.test.js` as test cases.
3. Adjust `CONFIG` (or `parseLabel()`) until the tests pass: `cd extension-tests` then `node --test` (needs
   Node.js 20 or later).
4. Reload the extension in `chrome://extensions`.

---

## For developers

| Path | What it does |
|---|---|
| `extension/outlook-parser.js` | reads the Outlook page |
| `extension/content.js` | runs in the Outlook tab (reading, badge) |
| `extension/planner.js` | turns events and existing worklogs into the day plan |
| `extension/projects.js` | builds projects and phases from Jira |
| `extension/config.js` | phases and roles (defaults, settings) |
| `extension/report.js` | numbers for the Charts page |
| `extension/jira.js` | Jira REST calls |
| `extension/backend.js` | settings, storage, Outlook connection, approval-gated posting |
| `extension/app.html` / `app.js` / `app.css` | the Timefill pages |
| `extension-tests/` | automated tests: `cd extension-tests && node --test` |

See [CHANGELOG.md](CHANGELOG.md) for the history of changes.

---

## Copyright

Copyright © 2026 Aria Behnam. **Designed by Aria Behnam.**
