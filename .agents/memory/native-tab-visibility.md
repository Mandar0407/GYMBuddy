---
name: Native tab visibility
description: Keyboard-aware scroll views can leave hidden native page containers occupying space
---

Keep tab visibility on an explicit outer page View, not only on the keyboard-aware scroll view's `style`. Retain inactive pages mounted when their drafts or live sessions must survive switching tabs.

**Why:** The keyboard controller's native inset mode introduces an outer flex container. Hiding the inner scroll view leaves that container in the layout, shrinking the active page. Web uses a plain ScrollView, so a browser screenshot can look correct while both native platforms show only a clipped heading.

**How to apply:** For persistent tab panels, give the outer page container `display: none` when inactive and the inner scroll view normal flex sizing. Native compilation and web screenshots do not verify native layout.