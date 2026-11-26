// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.

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
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "open-app") openApp();
});
