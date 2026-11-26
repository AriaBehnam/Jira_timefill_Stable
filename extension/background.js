// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Opens the Timefill page when you click the toolbar icon or the badge in Outlook.
const APP = chrome.runtime.getURL("app.html");

async function openApp() {
  try {
    const [tab] = await chrome.tabs.query({ url: APP + "*" });
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
  } catch { /* fall through and open a new tab */ }
  await chrome.tabs.create({ url: APP + "#/status" });
}

chrome.action.onClicked.addListener(openApp);

// After "Update" in Timefill, the extension restarts with the new version: open Timefill again.
chrome.storage.local.get("reopen_after_update").then((o) => {
  if (!o.reopen_after_update) return;
  chrome.storage.local.remove("reopen_after_update");
  openApp();
}).catch(() => {});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-app") openApp();
});
