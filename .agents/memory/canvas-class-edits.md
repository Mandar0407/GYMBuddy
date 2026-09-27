---
name: Canvas class edits
description: Why live visual edits can diverge from responsive stylesheet rules.
---

Visual edits to a selected live component can replace a semantic class with an arbitrary utility class while the old stylesheet rules remain. The app may look acceptable at one viewport but break at another because those rules no longer match.

**Why:** A header unexpectedly became oversized and appeared on mobile despite an existing responsive hide rule. The live JSX class had changed, not the breakpoint or server.

**How to apply:** When a canvas-edited element does not obey its expected CSS, compare its current JSX class names with stylesheet selectors before changing breakpoints or repeatedly restarting the app.