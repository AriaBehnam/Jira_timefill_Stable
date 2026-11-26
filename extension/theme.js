// Timefill — Jira hours from your Outlook calendar.
// Copyright (c) 2026 Aria Behnam. Designed by Aria Behnam.
// SPDX-License-Identifier: Apache-2.0 (see LICENSE and NOTICE)

// Light or dark, set before the page is drawn (so it never flashes white): your choice (the ☾ / ☀ button in the
// top-right corner, remembered in this browser), else your system's setting.
(() => {
  let theme = null;
  try { theme = localStorage.getItem("timefill_theme"); } catch { /* private window */ }
  if (theme !== "dark" && theme !== "light") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
})();
