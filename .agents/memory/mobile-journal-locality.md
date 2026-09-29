---
name: Mobile journal locality
description: Why GYM Buddy’s phone journal is intentionally separate from the web journal
---

Nutrition, strength, weight, water, fasting, and interval routines saved on the phone are not a copy of the website’s journal. Only Movement uses web pairing to exchange data. Do not imply a meal or workout logged on one device appears on the other.

**Why:** The website stores its journal in browser-local storage, and the user requested a matching mobile experience while preserving existing native step tracking and pairing, not a migration of browser-local records to a shared account.

**How to apply:** When changing dashboards, labels, onboarding, or data storage, be explicit about which records are device-local. Cross-device journal sync would require its own account/data migration design; preserve both stores until the user chooses one.