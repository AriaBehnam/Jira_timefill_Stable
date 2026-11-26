# Timefill

**Fill your Jira hours from your Outlook calendar.** Timefill is a Chrome extension. It reads the meetings and
tasks in your Outlook web calendar, matches them to your Jira projects, and proposes the worklogs. You check and
approve each one before anything is written to Jira.

*Designed by Aria Behnam.* Licensed under the [Apache License 2.0](LICENSE).

---

## Contents

1. [What it does](#what-it-does)
2. [What you need](#what-you-need)
3. [Install](#install)
4. [First-time setup](#first-time-setup-5-minutes)
5. [Everyday use](#everyday-use)
6. [Update to a new version](#update-to-a-new-version)
7. [Uninstall](#uninstall)
8. [How an event becomes a worklog](#how-an-event-becomes-a-worklog)
9. [Projects](#projects)
10. [Charts](#charts)
11. [Privacy & safety](#privacy--safety)
12. [Troubleshooting](#troubleshooting)
13. [For developers](#for-developers)
14. [License & copyright](#license--copyright)

---

## What it does

- **Reads your calendar.** It reads Outlook web in Chrome. It never creates, changes or deletes anything in your
  calendar.
- **Matches events to projects.** An event called `Big Job E design review` goes to the project *Big Job*, the
  engineering role (*E*), and the phase the project is in now.
- **Shows your week.** A calendar view shows what is already in Jira, what is ready to fill, and which hours are
  still missing.
- **Asks before writing.** Nothing goes to Jira until you approve it.
- **Handles leave.** All-day out-of-office or vacation events go to your leave issue.
- **Shows charts.** Hours per project, placed vs. missing hours, and time per type of work, by day, week or month.

---

## What you need

- **Google Chrome** (or Microsoft Edge) on your computer.
- **Outlook on the web** (`outlook.office.com`, `outlook.office365.com` or `outlook.cloud.microsoft`), signed in,
  in the same browser.
- **Jira Cloud** (`https://<your-company>.atlassian.net`), signed in, in the same browser.

Nothing else: no server, no extra account, no API key.

---

## Install

1. **Download Timefill.** On this GitHub page, click the green **Code** button → **Download ZIP**.
2. **Unzip it to a folder that stays where it is**, for example `Documents\Timefill`. Chrome loads Timefill from
   this folder every time, so don't delete or move it later.
3. **Open the extensions page.** In Chrome, type `chrome://extensions` in the address bar and press Enter.
   (Edge: `edge://extensions`.)
4. **Turn on Developer mode** with the switch at the top right (Edge: on the left).
5. **Load it.** Click **Load unpacked** and choose the **`extension`** folder inside the folder you unzipped
   (the one that contains `manifest.json`).
6. **Pin it.** Click the puzzle-piece icon in Chrome's toolbar and the pin next to **Timefill**.
7. **Open it.** Click the Timefill icon. Timefill opens in its own tab.

> Chrome may show a note about extensions in developer mode when it starts. That is normal for extensions that are
> not installed from the Chrome Web Store; press **Keep** or close it.

---

## First-time setup (5 minutes)

Open Timefill → **Settings**.

1. **Jira URL:** `https://yourcompany.atlassian.net`. Keep *Sign-in* on "Use my Jira login in this Chrome" and
   make sure you are signed in to Jira in the same Chrome. Press **Test Jira connection**.
2. **Track from:** the first day Timefill should look at. Nothing before it is read or counted as missing.
3. **Projects query:** which Jira issues are "yours". The default is `assignee = currentUser() ORDER BY key`.
   Timefill also adds every issue you logged time on.
4. **Vacation issue:** the Jira issue where you log leave, e.g. `LEAVE-1`.
5. **Working time:** the hours of your working day, lunch break, and hours per weekday.
6. **Your calendars:** the name of your own calendar in Outlook's calendar list (default: *Calendar* /
   *Calendario*). Change it only if yours has another name.
7. **Phases & roles:** how your Jira issue summaries are written (see below).
8. Go to **Projects** and press **↻ Detect new projects**. Then give each project one or more **calendar
   keywords**: words you use in your event titles, e.g. `big job`.

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

1. Open your **Outlook web calendar** in Chrome, in **Week** or **Work week** view, and keep that tab open.
2. Open Timefill → **Status**. Your week is read from Outlook and Jira. A small badge in the Outlook tab shows
   a red dot while Timefill reads and a green one when it's done, with the days it read.
3. Check the calendar:

   | Colour | Meaning |
   |---|---|
   | green | already logged in Jira |
   | blue | to fill (proposed from your calendar) |
   | purple | vacation |
   | striped red | missing hours |
   | dashed yellow | event without a matching project (click it to choose one) |
   | orange | Jira and your calendar don't match |

4. Fix anything that's wrong:
   - **Click a blue block** to change its project, phase or time, or choose *Don't fill*. **Send to Jira** in that
     box writes just this worklog to Jira right away (that click is your approval).
   - **Drag a block** to move it, or drag its top or bottom edge to change its length. Steps are 15 minutes; hold
     Alt for 5.
   - **Drag over a red block** to assign part of it, or click it to assign all of it.
   - **Click a green block** to change a worklog that is already in Jira. Timefill asks before it changes Jira.
   - **Click an orange block** to see what Jira has and what your calendar has. For an event that isn't in Jira,
     press **Fill it** (its project, its time) or **Other project…**; press **Ignore** if it's fine as it is. The
     **not like calendar** button at the top lists the whole week.
5. Press **Review & approve**, tick the worklogs you agree with (the box in the **Approve** header selects all),
   then press **Post approved to Jira**.

Use **‹ This week ›** to move between weeks, and **Both / Jira / Outlook** above the calendar to see everything,
only what is already in Jira, or only your calendar. Press **↻ Refresh** whenever you changed something in Outlook
or Jira yourself.

---

## Update to a new version

Your settings, projects and keywords are kept when you update.

1. Download the new version: **Code** → **Download ZIP** on this page.
2. Unzip it and copy its contents **over your existing Timefill folder** (replace the files). Use the same folder
   as before: Chrome keeps your settings for that folder.
3. In `chrome://extensions`, press the **reload** icon (↻) on the Timefill card.

The version you have is shown on the Timefill card in `chrome://extensions`; the changes of each version are in
[CHANGELOG.md](CHANGELOG.md).

---

## Uninstall

In `chrome://extensions`, press **Remove** on the Timefill card, then delete the Timefill folder. This also
deletes everything Timefill stored in your browser. Nothing is removed from Jira or Outlook.

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

- **All-day events: you choose.** Every all-day event of a working day is shown in the day's all-day row. Busy and
  out-of-office ones with a project start ticked ☑; Free ones and ones without a project start unticked ☐. The
  ticked ones share what the day still needs (working hours − Jira − timed events of that day), e.g. 4h + 4h.
  Click one to tick or untick events, pick another project and phase, or type your own hours; **Reset day** goes
  back to the default. The blue blocks they make can be changed like any other block. An event over several days
  (Wed → Fri) is on each working day; weekends and holidays are skipped.
- **Leave.** An all-day *Out of office* or vacation event fills the day on your vacation issue. If Jira already has
  a leave worklog that day, the day counts as fully booked.
- **Ignored events.** Declined and cancelled events are ignored, and so are events with one of your ignore words.
- **Events at the same time** are both proposed in full, side by side, like in your calendar. Drag or resize them
  to split the time the way you want.
- **Hours count, not clock times.** A day that already has its full hours in Jira is complete, even if those
  worklogs start at other times.
- **Outside working hours.** Work before or after your working hours counts normally. You can turn this off in
  Settings.
- **Lunch.** Lunch is never filled with missing time or vacation, but a meeting that runs over lunch counts in full.
  Set the lunch start and end to the same time if you have no lunch break.

---

## Projects

- **What counts as a project.** A Jira **epic** with all its child issues as phases, or a group of issues sharing
  the same project code (e.g. `26.001`).
- **External and Internal.** External projects (customer work, with a code) use keyword + role + phase. Internal
  projects (company work, no code) give each issue its own keywords and its own chart type. You can switch any
  project between them.
- **Status.** A project's status (its current phase) is detected from Jira and from where you logged hours. You
  can also set it by hand.
- **Adding a project.** Use **Find a project in Jira** to search by name, project code or Jira key (e.g. `PRJ-226`)
  and add any project to your list, even one that isn't assigned to you.

---

## Charts

Pick a **day, week or month** in the small calendar (click a week number, a day, or the month name). Then read:

- **Hours per project**, including vacation / absence.
- **Placed vs. missing hours** per week or month.
- **Time by type of work** (pre-sale, project, installation, internal, training, general, vacation / absence) per
  week or month. Internal projects count as *internal*; choose another type per issue (e.g. *training*, or
  *vacation / absence* for a leave or permit issue) in Projects → Internal projects → **Chart**. *General* is time
  on issues outside your projects.

Each chart has a *Show as table* view.

---

## Privacy & safety

- **Outlook is only read**, and only while Timefill is open. Timefill never types, saves or deletes anything there.
  It only clicks:
  - Outlook's own **"+N more events"** buttons, to see hidden events (you can turn that off in Settings);
  - when you open the Status page or press ↻ Refresh and **other people's calendars are ticked** in Outlook's
    calendar list: it unticks them for the moment of the read and ticks them again, so only your own events are
    read. Your own calendar is never unticked.
- When you look at a week your Outlook tab isn't showing, Timefill moves that calendar tab to the week (only the
  view changes), unless you are typing or have a form open there. It never opens a new tab by itself.
- **Jira is written only after your approval**, one worklog at a time.
- **Your data stays with you.** Everything Timefill keeps (settings, projects, keywords, a copy of your calendar)
  is stored in your own browser profile and is never sent anywhere. Network requests go only to your own
  `*.atlassian.net` site, and Jira requests never follow a redirect to another address.
- **No API token needed.** Timefill uses your normal Jira login in the browser. If you choose to use an API token
  instead, it is stored only in your browser profile, apart from the settings, and never shown or sent elsewhere.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| "No Outlook tab is open" | Open your Outlook web calendar in the same browser (Week or Work week view), then press **↻ Refresh**. |
| "Calendar not read yet" for some days | Show that week in your Outlook tab, or press **Open week in Outlook**, then **↻ Refresh**. |
| Jira test fails | Check the Jira URL (`https://<name>.atlassian.net`) and that you are signed in to Jira in the same browser. |
| An event is not proposed | Check its title has a project keyword (Projects page). Dashed yellow blocks have none: click one to choose a project. |
| Some all-day events are missing | Press **↻ Refresh** with Outlook showing that week: Timefill opens Outlook's "+N more" boxes to see them. |
| Timefill says other calendars are shown | Press **↻ Refresh**: your own calendar is read with the others unticked for a moment. If your calendar has another name, set it in Settings → **Your calendars**. |
| Nothing works after an update | In `chrome://extensions`, press the reload icon on Timefill, then reload the Timefill tab. |

### When Outlook web changes

Everything that reads the Outlook page is in `extension/outlook-parser.js`; the parts you may need to adjust are at
the top of that file, in `CONFIG`.

1. With your Outlook calendar open, go to Timefill → Settings → **Diagnose Outlook page**. It shows the raw text
   Timefill sees and how it understood it. To see why one event isn't read, type its title in the box under
   **Diagnose Outlook page** first. For a week that isn't filled as expected, press **↻ Refresh** on the Status
   page and open the browser console (F12 → Console): the group **[Timefill] trace** shows each step with counts.
2. Copy a few new labels into `extension-tests/parser.test.js` as test cases.
3. Adjust `CONFIG` (or `parseLabel()`) until the tests pass: `cd extension-tests` then `node --test` (needs
   Node.js 20 or later).
4. Reload the extension in `chrome://extensions`.

---

## For developers

| Path | What it does |
|---|---|
| `extension/manifest.json` | the extension's name, version and permissions |
| `extension/outlook-parser.js` | reads the Outlook page |
| `extension/content.js` | runs in the Outlook tab (reading, badge) |
| `extension/planner.js` | turns events and existing worklogs into the day plan |
| `extension/projects.js` | builds projects and phases from Jira |
| `extension/config.js` | phases and roles (defaults, settings) |
| `extension/report.js` | numbers for the Charts page |
| `extension/jira.js` | Jira REST calls |
| `extension/backend.js` | settings, storage, Outlook connection, approval-gated posting |
| `extension/app.html` / `app.js` / `app.css` | the Timefill pages |
| `extension-tests/` | automated tests: `cd extension-tests && node --test` (Node.js 20 or later) |

No build step and no dependencies: the `extension` folder is loaded by the browser as it is.
See [CHANGELOG.md](CHANGELOG.md) for the history of changes.

---

## License & copyright

Copyright © 2026 Aria Behnam. **Designed by Aria Behnam.**

Timefill is licensed under the [Apache License, Version 2.0](LICENSE). You may use, change and share it, also in a
company, as long as you keep the copyright and the [NOTICE](NOTICE) file. It comes without any warranty.
