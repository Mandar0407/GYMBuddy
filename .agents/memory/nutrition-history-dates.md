---
name: Nutrition history dates
description: How to interpret meal history from before date-aware logging.
---

Meal records from before date-aware logging cannot always be dated reliably. A valid timestamp in an old record can identify its original local day; entries without recoverable dates are retained on the first migration day and should not be interpreted as genuine historical activity for that day.

**Why:** Earlier logs saved a clock time but no calendar date. Guessing past days would fabricate trends, while dropping those meals would erase user data.

**How to apply:** When building weekly nutrition trends, exports, or meal history, distinguish reconstructable entries from unknown-origin legacy entries, or explain the limitation instead of treating migration-day entries as precise history.