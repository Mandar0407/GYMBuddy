---
name: Native form sizing
description: Vertical flex fields can collapse inside native scrollable form content
---

Use intrinsic, nonshrinking height for vertical form fields inside native scroll content. Reserve equal-width flex sizing for horizontal column wrappers.

**Why:** The native profile form showed overlapping fields and actions because vertical fields used zero-basis `flex: 1` inside intrinsic-height scroll content. Browser layout is not sufficient evidence for this native sizing case.

**How to apply:** Check field sizing independently from the scroll viewport. Keep the viewport bounded, but let its form content grow naturally rather than stretching or compressing every field.