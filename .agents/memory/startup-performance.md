---
name: Startup performance
description: Preserve restored sessions while reducing Expo preview startup work and judging speed claims accurately.
---

Defer optional libraries, but keep session recovery and movement summaries independent of whether the user opens their tab.

**Why:** GYM Buddy has saved rest timers, active workout sessions and Today movement metrics. Deferring all hidden screens indiscriminately would make the initial dashboard inaccurate or leave restored timers inactive.

**How to apply:** Treat first-visit UI loading separately from background recovery. Keep mounted drafts after first visit. Prefer selective font and icon imports because Metro's development graph can eagerly include unused families from barrel modules.

A smaller development bundle or a fast server-side request is not a measured improvement to launch time on the user's phone.

**Why:** The user's reported delay was through Expo Go / Replit preview. Compilation, transfer over the phone's connection and native rendering are separate costs; a browser screenshot and manifest bundle check cannot measure native on-device launch time.

**How to apply:** Report bundle measurements as bundle measurements and clearly distinguish preview overhead from installed-app performance.