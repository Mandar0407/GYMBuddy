---
name: Paired journal sync
description: Why GYM Buddy uses Movement pairing for conservative journal sync
---

The existing Movement pairing key is also the identity for journal sync. Keep original browser and phone stores when pairing; merge records without silently overwriting different versions. Unpaired records and active workout drafts remain local. Conflict status should remain visible until the user can resolve it.

**Why:** The user asked for cross-device meals and workouts but did not want the website redesigned. It has no separate account login, and existing browser/phone records may be older or ambiguous. Reusing pairing avoids a new login but makes conservative reconciliation essential to prevent data loss.

**How to apply:** Any new synced record type needs compatible phone/web validation, conflict and deletion behavior, and a way to refresh already-mounted screens. Do not sync active timers/drafts as if they were completed records or reset local records on initial pairing.