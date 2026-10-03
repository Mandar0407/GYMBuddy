---
name: Backup reconciliation
description: Safety decisions for local GYM Buddy backups alongside paired journal sync
---

Keep current conflicting records and preferences by default when merging a backup. Previously deleted paired records need deterministic restoration identifiers, with linked set identifiers remapped consistently.

**Why:** Reusing a deleted identifier can collide with paired deletion markers, while generating a new random identifier for each import duplicates the same restored record on repeated imports.

**How to apply:** Any changes to import behavior must preserve repeat-import idempotence and completed-workout membership constraints. Never silently overwrite a current conflicting record or assign a set to two completed workouts.

Keep advanced libraries and preferences device-local until compatible server and website conflict/deletion handling exists. Export private progress photos only by explicit opt-in, as portable image data rather than another device's filesystem paths. Exclude pairing credentials.

**Why:** Existing journal pairing does not define synchronization for these new entities, and private photos must not be uploaded or exported implicitly.

**How to apply:** Broader synchronization is a separate server/web/mobile feature. Backup export should flush recoverable drafts first and read committed provider snapshots, rather than stale values captured before those asynchronous saves.