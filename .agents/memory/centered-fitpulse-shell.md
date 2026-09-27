---
name: Centered FitPulse shell
description: Why FitPulse uses shell-based layout styling even on wide browser windows.
---

Keep FitPulse centered within a 640px-wide shell on large screens while preserving the existing spacing inside cards, forms, and sections. New layout rules should respond to the shell width rather than assuming a wide browser window means the app itself is wide.

**Why:** The user first chose a centered narrow app with preserved component spacing, then changed the maximum to 640px and requested 16px shell/main padding. Viewport-only desktop breakpoints can put a desktop sidebar inside a still-narrow shell.

**How to apply:** When adding responsive UI, use shell-aware sizing and verify the result on both a wide browser window and a phone-sized viewport. Avoid blanket margin, padding, or width overrides on every element.