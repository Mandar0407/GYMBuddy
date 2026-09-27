---
name: Motion session resume
description: Browser motion permissions and honest tracking state after refresh or tab suspension.
---

Remember that a motion-tracking session was requested, but do not describe it as live after a refresh or a hidden-tab pause until a fresh sensor reading arrives. Offer an explicit Resume action.

**Why:** iOS motion permission can require a new user gesture, and browsers can suspend motion readings in background tabs. Restoring a visual “live” state without a working listener would silently miss steps.

**How to apply:** Any future change to movement tracking should distinguish saved intent from an attached, reading sensor. Resume only after the user acts and the browser supplies a valid sample; persist counted steps separately.