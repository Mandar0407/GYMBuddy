---
name: Expo native preview verification
description: Native bundle checks in the monorepo must use the Expo manifest's launch URL
---

When checking iOS or Android loading, request the Expo manifest with the matching `expo-platform` header and `Accept: application/expo+json`, then fetch its `launchAsset.url`.

**Why:** Metro's monorepo entry paths can include the artifact directory. Guessing the usual root `/node_modules/expo-router/entry.bundle` can return a misleading resolution error even when the real native bundle compiles correctly.

**How to apply:** Check both platform bundles independently of the web screenshot. Bundle success verifies compilation and delivery, not rendering in a native simulator; do not claim a native runtime is verified without observing it.