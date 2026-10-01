---
name: Native tab visibility
description: Keyboard-aware scroll views can leave hidden native page containers occupying space
---

Keep tab visibility on an explicit outer page View, not only on the keyboard-aware scroll view's `style`. Retain inactive pages mounted when their drafts or live sessions must survive switching tabs.

**Why:** The keyboard controller's native inset mode introduces an outer flex container. Hiding the inner scroll view leaves that container in the layout, shrinking the active page. Web uses a plain ScrollView, so a browser screenshot can look correct while both native platforms show only a clipped heading.

**How to apply:** For persistent tab panels, give the outer page container `display: none` when inactive and the inner scroll view normal flex sizing. Native compilation and web screenshots do not verify native layout.

Prefer the keyboard-aware component's direct-scroll `layout` mode for persistent native panels unless inset-mode behaviour has been verified on-device.

**Why:** Inset mode introduces a native decorator boundary absent from the browser fallback. It is a plausible source of native-only sizing/scroll problems; direct-scroll layout retains keyboard focus handling without that boundary. Root providers already supply flex sizing, so adding provider styles is not evidence of a fix.

**How to apply:** Keep the viewport bounded and the content height unconstrained. Component-contract tests can guard the selected mode and forwarded props, but neither those tests nor a successful bundle proves native touch scrolling works.