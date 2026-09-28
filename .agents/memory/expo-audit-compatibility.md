---
name: Expo dependency audit compatibility
description: Why a clean dependency audit is not enough for older CommonJS packages used by Expo Router.
---

When resolving transitive security advisories in Expo, verify runtime imports through the actual parent packages. An audit-generated open-ended override can select a secure but ESM-only version that breaks the older CommonJS caller. Prefer a patched CommonJS-compatible version where available. If only an ESM patch exists, keep the parent API intact and use a narrowly scoped compatibility patch rather than assuming a major parent upgrade is drop-in.

**Why:** A security auto-fix selected an ESM decoder that the installed CommonJS query parser could not call, and an upgraded query parser changed its exports in a way Expo Router could not consume. The auto-fix also reserialized workspace configuration, removing explanatory comments.

**How to apply:** After future audit fixes, check both the audit result and live parent-package behavior (including Metro/web preview where relevant), and preserve workspace safety settings and their documentation.