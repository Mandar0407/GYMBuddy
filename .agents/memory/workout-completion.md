---
name: Workout completion semantics
description: Why logged strength sets alone cannot define a completed workout
---

Count a workout as completed only when the user explicitly marks it finished, and associate completion with the actual set identities. If all member sets are deleted, that completion should no longer count.

**Why:** A day with logged sets is not evidence that a whole workout was completed, and timestamps or calendar dates cannot reliably separate sessions. Clock changes can also make timestamp-based membership wrong.

**How to apply:** In future strength summaries, distinguish logged sets, training days, and explicitly completed workouts. Do not label the first two as completed workouts.