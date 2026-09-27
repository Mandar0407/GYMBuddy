---
name: Stride auto-migration
description: Compatibility decision for height-based automatic stride length and older saved values.
---

Treat the old default stride of 74 cm as automatic during migration; preserve other valid old stride values as manual overrides. Once the new override state exists, keep a manual value until the person explicitly resets it to automatic.

**Why:** Older versions persisted 74 cm for everyone, even if they never edited stride. There is no way to distinguish someone who manually chose exactly 74 cm from someone who kept the default. Preserving every legacy value as an override would prevent the new height formula from working for most existing users.

**How to apply:** When revisiting stride storage or syncing profile data, do not infer a manual override merely because a legacy stride value is present. Height changes should only recalculate stride in automatic mode.