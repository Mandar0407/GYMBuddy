---
name: Expo DevTools startup warning
description: Optional React Native DevTools can fail even while the Expo app runs normally
---

The Expo workflow may print an ERROR about React Native DevTools missing libglib-2.0.so.0, yet Metro continues to serve the QR code and the web preview bundles and renders correctly.

**Why:** This concerns the optional debugger binary in the environment, not the app bundle or its runtime.

**How to apply:** Judge startup by Metro serving/bundling and the app preview. Do not treat the DevTools installation warning alone as a release-blocking app crash.