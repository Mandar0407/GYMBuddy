---
name: Headless browser focus
description: CSS focus pseudo-class behavior in headless Chromium's new tabs
---

When checking focus styles through CDP in a newly created headless browser tab, bring that tab to the foreground before programmatically focusing an input. Merely finding the input in `document.activeElement` is not enough to ensure `:focus` styles are applied.

**Why:** A headless smoke check reported an active input but its focus border and shadow remained unchanged. Waiting longer did not help; activating the tab before focusing did.

**How to apply:** For browser checks that inspect computed focus styles, activate the target page first, then focus the control and allow its CSS transition to settle. This prevents false failures when testing visual focus behavior.