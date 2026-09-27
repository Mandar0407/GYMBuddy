---
name: Centered FitPulse shell
description: Why FitPulse uses narrow-layout styling even on wide browser windows.
---

Keep FitPulse centered within a 430px-wide shell on all screen sizes while preserving the existing spacing inside cards, forms, and sections. New layout rules should respond to the shell width rather than assuming a wide browser window means the app itself is wide.

**Why:** The user explicitly chose a centered 430px app with preserved component spacing over a literal global CSS reset. Viewport-only desktop breakpoints can put multi-column layouts and a desktop sidebar inside the narrow shell.

**How to apply:** When adding responsive UI, use shell-aware sizing and verify the result on both a wide browser window and a phone-sized viewport. Avoid blanket margin, padding, or width overrides on every element.