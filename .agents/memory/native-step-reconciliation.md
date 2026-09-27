---
name: Native step reconciliation
description: Reconciliation principle when native pedometer history overlaps earlier browser motion estimates.
---

Treat historical native pedometer counts as the authoritative source for a paired day, not an increment to browser-estimated activity. Store new manual additions as separate, idempotent events.

**Why:** Earlier browser totals mixed manual additions and motion peaks without source attribution, so their overlap with a later phone history query cannot be resolved safely. Summing them would overcount; silently claiming that all old manual steps were retained would be false.

**How to apply:** When changing pairing, migration, reset, or hourly charts, preserve the distinction between old ambiguous entries, replaceable native snapshots, and post-pair manual events. If adding a migration, show explicitly what old activity cannot be attributed.