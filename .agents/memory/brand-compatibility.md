---
name: Brand compatibility
description: Rebranding display text without disrupting existing GYM Buddy installs and saved data
---

When changing the GYM Buddy name or visual branding, preserve legacy package, deep-link, pairing, and browser-storage identifiers unless a separate migration is explicitly planned.

**Why:** The app was rebranded from FitPulse while maintaining existing profiles, movement pairing, and mobile installations. These non-visible identifiers remain deliberately stable; renaming them as a text-cleanup step would strand existing data or links.

**How to apply:** Change user-visible copy, icons, metadata, and colors as requested, but treat changes to internal identifiers as a migration requiring compatibility handling.